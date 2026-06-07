

import os
import sys
import json
import random
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Dict, Any, Optional, List, Tuple

import pandas as pd
import joblib
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS

import torch
import torch.nn as nn
from torchvision import transforms, models


BASE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_MODELS_DIR = BASE_DIR / "assets" / "models"


# ============================================================
# Q-wise Model Head (same as your train.py)
# ============================================================
class ResNetHead(nn.Module):   # A custom neural network module that uses a ResNet backbone (specifically ResNet-18) and replaces the final fully connected layer with a new head that consists of a linear layer, ReLU activation, dropout, and another linear layer to output the desired number of classes (out_dim). This class is used to create both the binary classification model for determining if a diagram is correct or wrong, and the multi-class classification model for identifying the type of issue in a wrong diagram. The forward method defines how the input tensor flows through the backbone and head to produce the final output logits.
    def __init__(self, out_dim: int):
        super().__init__()
        base = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
        feat = base.fc.in_features
        base.fc = nn.Identity()
        self.backbone = base
        self.head = nn.Sequential(
            nn.Linear(feat, 256),
            nn.ReLU(),
            nn.Dropout(0.25),
            nn.Linear(256, out_dim),
        )

    def forward(self, x):    # The forward method takes an input tensor x (which represents the preprocessed image) and passes it through the backbone (the ResNet-18 model without the final fully connected layer) to extract features. The output of the backbone is then passed through the head (the custom layers defined in the __init__ method) to produce the final output logits, which can be used for classification tasks. This method is called during prediction to evaluate the uploaded diagram images against the trained models for both binary correctness and issue type classification.
        return self.head(self.backbone(x))


# ============================================================
# NEW Predictor: QWiseDiagramPredictor
# ============================================================
class QWiseDiagramPredictor:
    """
    Uses:
      - models/artifacts_qwise/meta.json
      - models/questions.xlsx  (columns: question_id, question_tex)
      - models/wronganswer_expected_corrections.csv
    """

    def __init__(    # The constructor of the QWiseDiagramPredictor class initializes
        self,
        art_dir: str,
        questions_xlsx: str,
        corr_csv: str,
        bin_threshold: float = 0.60,
        type_threshold: float = 0.55,
    ):
        self.art_dir = str(art_dir)   # The constructor of the QWiseDiagramPredictor class initializes
        self.meta_path = os.path.join(self.art_dir, "meta.json")   # It sets up the paths to the artifacts directory, the meta.json file, the questions.xlsx file, and the wrong answer corrections CSV file. It also initializes the thresholds for binary classification and issue type classification. The constructor loads the meta information from the meta.json file, sets up the image transformation pipeline, loads the question text from the Excel file, and loads the corrections mapping from the CSV file. It also prepares caches for loaded models and creates mappings between question IDs and question numbers for easy reference during prediction.
        self.questions_xlsx = str(questions_xlsx)   # The constructor of the QWiseDiagramPredictor class initializes
        self.corr_csv = str(corr_csv)    # The constructor of the QWiseDiagramPredictor class initializes

        self.bin_threshold = float(bin_threshold)    # The constructor of the QWiseDiagramPredictor class initializes
        self.type_threshold = float(type_threshold)    # The constructor of the QWiseDiagramPredictor class initializes

        if not os.path.exists(self.meta_path):   # The constructor of the QWiseDiagramPredictor class checks if the meta.json file exists at the specified path. If it does not exist, it raises a FileNotFoundError indicating that the meta information is missing and suggests training first. This ensures that the predictor has the necessary metadata to function correctly, such as information about the questions, model paths, and other configurations needed for prediction.
            raise FileNotFoundError(f"Meta not found: {self.meta_path} (train first)")

        with open(self.meta_path, "r", encoding="utf-8") as f:
            self.meta = json.load(f)

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")  # The constructor of the QWiseDiagramPredictor class sets the device to use for model inference, preferring CUDA if available, otherwise falling back to CPU. This allows the predictor to leverage GPU acceleration for faster predictions if a compatible GPU is present, while still being able to run on systems without a GPU.
        self.img_size = int(self.meta.get("img_size", 224))   # The constructor of the QWiseDiagramPredictor class retrieves the image size from the meta information, defaulting to 224 if not specified. This image size is used in the transformation pipeline to resize the input images to the expected dimensions for the models. Ensuring that the input images are resized to a consistent size is important for the models to function correctly, as they were likely trained on images of that specific size.
        self.tfm = transforms.Compose([
            transforms.Resize((self.img_size, self.img_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])

        # Load question text
        self.qtext: Dict[str, str] = {}
        if os.path.exists(self.questions_xlsx):
            qdf = pd.read_excel(self.questions_xlsx)
            for _, r in qdf.iterrows():
                qid = str(r.get("question_id", "")).strip()
                if qid:
                    self.qtext[qid] = str(r.get("question_tex", "")).strip()

        # Load corrections mapping
        if os.path.exists(self.corr_csv):
            self.corr_df = pd.read_csv(self.corr_csv)
        else:
            self.corr_df = pd.DataFrame(columns=["question_no", "wronganswer_folder", "issue_description", "expected_correction"])

        # caches
        self._bin_models: Dict[str, ResNetHead] = {}
        self._type_models: Dict[str, Dict[str, Any]] = {}

        self.question_ids = list(self.meta.get("questions", {}).keys())   # The constructor of the QWiseDiagramPredictor class retrieves the list of question IDs from the meta information. It then creates mappings between question numbers and question IDs by parsing the question numbers from the question IDs using the _parse_question_no helper function. This allows for easy reference to questions by their number during prediction, while still maintaining the original question IDs as defined in the meta information. The constructor also sorts the question IDs based on their parsed question numbers to ensure a consistent order when retrieving all questions.
        self.question_no_to_id: Dict[int, str] = {}
        self.question_id_to_no: Dict[str, int] = {}
        for qid in self.question_ids:
            qno = self._parse_question_no(qid)
            if qno is None:
                continue
            self.question_id_to_no[qid] = qno
            if qno not in self.question_no_to_id:
                self.question_no_to_id[qno] = qid

        self.question_ids = sorted(
            self.question_ids,
            key=lambda qid: (self.question_id_to_no.get(qid, 10**9), str(qid)),
        )

    def _parse_question_no(self, value: Any) -> Optional[int]:   # The _parse_question_no helper function attempts to parse a question number from a given value, which can be of any type. It first checks if the value is None and returns None if so. If the value is already an integer, it returns it directly. Otherwise, it converts the value to a string, strips whitespace, and checks if it is empty, returning None if it is. It then tries to convert the text to an integer directly, and if that fails, it uses regular expressions to search for digits in the text. It first looks for digits at the end of the text, and if found, returns that as the question number. If not found, it looks for any digits in the text and returns the first match as the question number. If no digits are found, it returns None. This function allows for flexible parsing of question numbers from various formats of input.
        if value is None:
            return None
        if isinstance(value, int):
            return value

        text = str(value).strip()  # The _parse_question_no helper function attempts to parse a question number from a given value, which can be of any type. It first checks if the value is None and returns None if so. If the value is already an integer, it returns it directly. Otherwise, it converts the value to a string, strips whitespace, and checks if it is empty, returning None if it is. It then tries to convert the text to an integer directly, and if that fails, it uses regular expressions to search for digits in the text. It first looks for digits at the end of the text, and if found, returns that as the question number. If not found, it looks for any digits in the text and returns the first match as the question number. If no digits are found, it returns None. This function allows for flexible parsing of question numbers from various formats of input.
        if not text:
            return None

        try:
            return int(text)
        except Exception:
            pass

        m = re.search(r"(\d+)$", text)
        if m:
            return int(m.group(1))

        m = re.search(r"(\d+)", text)
        if m:
            return int(m.group(1))

        return None

    def _prepare_image(self, file_storage) -> torch.Tensor:   # The _prepare_image helper function takes a file storage object (representing the uploaded image file) and prepares it for input into the models. It first attempts to seek to the beginning of the file stream to ensure that the image can be read from the start. It then opens the image using PIL, converts it to RGB format, and applies the defined transformations (resizing, converting to tensor, and normalizing). Finally, it adds a batch dimension to the tensor and moves it to the appropriate device (CPU or GPU) for model inference. This function ensures that the uploaded image is properly preprocessed and formatted for use with the ResNet-based models during prediction.
        try:
            file_storage.stream.seek(0)
        except Exception:
            pass
        img = Image.open(file_storage.stream).convert("RGB")
        return self.tfm(img).unsqueeze(0).to(self.device)

    def _abs_path(self, maybe_path: str) -> str:
        p = str(maybe_path).strip()
        if os.path.isabs(p):
            return p

        # Support both path styles in meta.json:
        # 1) "Question01_binary.pt" (relative to art_dir)
        # 2) "artifacts_qwise/Question01_binary.pt" (relative to parent of art_dir)
        art_dir_norm = os.path.normpath(self.art_dir)
        art_base = os.path.basename(art_dir_norm)
        p_norm = os.path.normpath(p)

        candidates = [
            os.path.join(art_dir_norm, p_norm),
            os.path.join(os.path.dirname(art_dir_norm), p_norm),
        ]

        prefix = art_base + os.sep   # Support case where p is like "artifacts_qwise/Question01_binary.pt" and art_dir is ".../artifacts_qwise"
        p_for_prefix = p_norm.replace("/", os.sep).replace("\\", os.sep)
        if p_for_prefix.startswith(prefix):
            trimmed = p_for_prefix[len(prefix):]
            candidates.append(os.path.join(art_dir_norm, trimmed))

        for c in candidates:
            if os.path.exists(c):
                return c

        # Keep previous fallback behavior when file does not exist.
        return candidates[0]

    def _get_correction(self, qid: str, wrong_folder: str) -> Optional[Dict[str, str]]:   # The _get_correction helper function takes a question ID and a wrong answer folder name, and looks up the corresponding issue description and expected correction from the corrections DataFrame loaded from the CSV file. It filters the DataFrame for rows that match the given question number (parsed from the question ID) and wrong answer folder. If a matching row is found, it returns a dictionary containing the issue description and expected correction. If no matching row is found, it returns None. This function allows the predictor to provide specific feedback about what issue was detected in a wrong diagram and what the expected correction should be, based on the mappings defined in the CSV file.
        df = self.corr_df
        if df is None or len(df) == 0:
            return None
        m = df[
            (df["question_no"].astype(str) == str(qid)) &
            (df["wronganswer_folder"].astype(str) == str(wrong_folder))
        ]
        if len(m) == 0:
            return None
        row = m.iloc[0]
        return {
            "issue_description": str(row.get("issue_description", "")).strip(),
            "expected_correction": str(row.get("expected_correction", "")).strip(),
        }

    def _load_bin_model(self, qid: str) -> ResNetHead:   # The _load_bin_model helper function takes a question ID and loads the corresponding binary classification model for that question. It first checks if the model for the given question ID is already cached in the _bin_models dictionary, and if so, it returns the cached model. If not, it looks up the question information from the meta data using the question ID, and retrieves the path to the binary model. It then constructs the absolute path to the model file, checks if it exists, and loads the model state into a ResNetHead instance. The loaded model is then cached in the _bin_models dictionary for future use and returned. This function allows for efficient loading of binary classification models for each question as needed during prediction.
        if qid in self._bin_models:
            return self._bin_models[qid]

        qinfo = self.meta["questions"].get(qid)
        if not qinfo:
            raise RuntimeError(f"Question {qid} not found in meta")

        path = qinfo.get("binary_model_path")    # The _load_bin_model helper function takes a question ID and loads the corresponding binary classification model for that question. It first checks if the model for the given question ID is already cached in the _bin_models dictionary, and if so, it returns the cached model. If not, it looks up the question information from the meta data using the question ID, and retrieves the path to the binary model. It then constructs the absolute path to the model file, checks if it exists, and loads the model state into a ResNetHead instance. The loaded model is then cached in the _bin_models dictionary for future use and returned. This function allows for efficient loading of binary classification models for each question as needed during prediction.
        if not path:
            raise RuntimeError(f"binary_model_path missing for question {qid}")

        path = self._abs_path(path)
        if not os.path.exists(path):
            raise FileNotFoundError(f"Binary model not found: {path}")

        m = ResNetHead(out_dim=2).to(self.device)
        m.load_state_dict(torch.load(path, map_location=self.device))
        m.eval()

        self._bin_models[qid] = m
        return m

    def _load_type_model(self, qid: str) -> Tuple[Optional[ResNetHead], Optional[List[str]]]:  # The _load_type_model helper function takes a question ID and loads the corresponding issue type classification model for that question, along with the list of issue type names. It first checks if the model for the given question ID is already cached in the _type_models dictionary, and if so, it returns the cached model and type names. If not, it looks up the question information from the meta data using the question ID, and retrieves the information about the wrong type model. It then constructs the absolute path to the model file, checks if it exists, and loads the model state into a ResNetHead instance. The loaded model and type names are then cached in the _type_models dictionary for future use and returned. This function allows for efficient loading of issue type classification models for each question as needed during prediction.
        qinfo = self.meta["questions"].get(qid, {})
        info = qinfo.get("wrong_type")
        if not info:
            return None, None

        if qid in self._type_models:  # The _load_type_model helper function takes a question ID and loads the corresponding issue type classification model for that question, along with the list of issue type names. It first checks if the model for the given question ID is already cached in the _type_models dictionary, and if so, it returns the cached model and type names. If not, it looks up the question information from the meta data using the question ID, and retrieves the information about the wrong type model. It then constructs the absolute path to the model file, checks if it exists, and loads the model state into a ResNetHead instance. The loaded model and type names are then cached in the _type_models dictionary for future use and returned. This function allows for efficient loading of issue type classification models for each question as needed during prediction.
            return self._type_models[qid]["model"], self._type_models[qid]["type_names"]

        path = info.get("model_path")   # The _load_type_model helper function takes a question ID and loads the corresponding issue type classification model for that question, along with the list of issue type names. It first checks if the model for the given question ID is already cached in the _type_models dictionary, and if so, it returns the cached model and type names. If not, it looks up the question information from the meta data using the question ID, and retrieves the information about the wrong type model. It then constructs the absolute path to the model file, checks if it exists, and loads the model state into a ResNetHead instance. The loaded model and type names are then cached in the _type_models dictionary for future use and returned. This function allows for efficient loading of issue type classification models for each question as needed during prediction.
        type_names = info.get("type_names") or []
        if not path or not type_names:
            return None, None

        path = self._abs_path(path)  # The _load_type_model helper function takes a question ID and loads the corresponding issue type classification model for that question, along with the list of issue type names. It first checks if the model for the given question ID is already cached in the _type_models dictionary, and if so, it returns the cached model and type names. If not, it looks up the question information from the meta data using the question ID, and retrieves the information about the wrong type model. It then constructs the absolute path to the model file, checks if it exists, and loads the model state into a ResNetHead instance. The loaded model and type names are then cached in the _type_models dictionary for future use and returned. This function allows for efficient loading of issue type classification models for each question as needed during prediction.
        if not os.path.exists(path):
            raise FileNotFoundError(f"Wrong-type model not found: {path}")

        m = ResNetHead(out_dim=len(type_names)).to(self.device)
        m.load_state_dict(torch.load(path, map_location=self.device))
        m.eval()

        self._type_models[qid] = {"model": m, "type_names": type_names}
        return m, type_names

    def get_all_questions(self) -> List[Dict[str, Any]]:  # The get_all_questions method retrieves a list of all questions available in the meta information. It iterates through the question IDs, retrieves the corresponding question number and question code for each question, and constructs a list of dictionaries containing the question number, question code, and question text. This allows the API to provide a list of all trained questions with their relevant information, which can be used by the frontend to display options for users to select when uploading their diagram images for evaluation.
        out = []
        for qid in self.question_ids:
            qno = self.question_id_to_no.get(qid)
            if qno is None:
                continue
            qcode = self.meta["questions"].get(qid, {}).get("question_code", f"Q{qno}")
            out.append({
                "question_no": qno,
                "question_code": qcode,
                "question_text": self.qtext.get(qid, f"Question {qno}"),
            })
        return out

    def get_random_question(self) -> Dict[str, Any]:  # The get_random_question method retrieves a random question from the list of all questions available in the meta information. It first calls the get_all_questions method to get the list of questions, checks if the list is not empty, and then uses the random.choice function to select and return a random question from the list. This allows the API to provide a random question option for users who may want to test their diagram images against a randomly selected question without having to choose a specific one.
        qs = self.get_all_questions()
        if not qs:
            raise RuntimeError("No trained questions available.")
        return random.choice(qs)

    @torch.no_grad()   # The predict method is the main function that takes an uploaded image file and a question number, and returns a dictionary containing the prediction results. It first parses the question number to find the corresponding question ID, prepares the image for model input, and retrieves the question text and code. It then performs binary classification using the loaded binary model to determine if the diagram is correct or wrong, and calculates the confidence of the prediction. If the confidence is below the binary threshold, it returns a response indicating a low confidence wrong answer. If the prediction is correct, it returns a response indicating a correct answer. If the prediction is wrong, it proceeds to perform issue type classification using the loaded type model to identify the specific issue with the diagram, and returns a response with the identified issue type and expected correction based on the mappings defined in the CSV file. This method provides detailed feedback on the correctness of the diagram and any issues detected, along with suggestions for correction.
    def predict(self, image_file, question_no: int) -> Dict[str, Any]:
        qno = self._parse_question_no(question_no)
        if qno is None:
            return {"success": False, "error": "question_no must be a valid number"}

        qid = self.question_no_to_id.get(qno)  # The predict method is the main function that takes an uploaded image file and a question number, and returns a dictionary containing the prediction results. It first parses the question number to find the corresponding question ID, prepares the image for model input, and retrieves the question text and code. It then performs binary classification using the loaded binary model to determine if the diagram is correct or wrong, and calculates the confidence of the prediction. If the confidence is below the binary threshold, it returns a response indicating a low confidence wrong answer. If the prediction is correct, it returns a response indicating a correct answer. If the prediction is wrong, it proceeds to perform issue type classification using the loaded type model to identify the specific issue with the diagram, and returns a response with the identified issue type and expected correction based on the mappings defined in the CSV file. This method provides detailed feedback on the correctness of the diagram and any issues detected, along with suggestions for correction.
        if qid is None:
            qid_txt = str(qno)
            if qid_txt in self.meta.get("questions", {}):
                qid = qid_txt
            else:
                for key in self.meta.get("questions", {}).keys():
                    if self._parse_question_no(key) == qno:
                        qid = key
                        self.question_no_to_id[qno] = key
                        self.question_id_to_no[key] = qno
                        break
        if qid is None:
            return {"success": False, "error": f"Question {question_no} is not in trained meta.json"}

        x = self._prepare_image(image_file)   # The uploaded image file and a question number, and returns a dictionary containing the prediction results. It first parses the question number to find the corresponding question ID, prepares the image for model input, and retrieves the question text and code. It then performs binary classification using the loaded binary model to determine if the diagram is correct or wrong, and calculates the confidence of the prediction. If the confidence is below the binary threshold, it returns a response indicating a low confidence wrong answer. If the prediction is correct, it returns a response indicating a correct answer. If the prediction is wrong, it proceeds to perform issue type classification using the loaded type model to identify the specific issue with the diagram, and returns a response with the identified issue type and expected correction based on the mappings defined in the CSV file. This method provides detailed feedback on the correctness of the diagram and any issues detected, along with suggestions for correction.

        question_text = self.qtext.get(qid, f"Question {qno}")
        question_code = self.meta["questions"].get(qid, {}).get("question_code", f"Q{qno}")

        # ---------- Stage 1 (Binary) ----------
        bin_model = self._load_bin_model(qid)
        logits = bin_model(x)
        probs = torch.softmax(logits, dim=1).squeeze(0)
        conf, pred = torch.max(probs, dim=0)
        conf = float(conf.item())
        pred = int(pred.item())  # 1 correct, 0 wrong

        if conf < self.bin_threshold:   # The  uploaded image file and a question number, and returns a dictionary containing the prediction results. It first parses the question number to find the corresponding question ID, prepares the image for model input, and retrieves the question text and code. It then performs binary classification using the loaded binary model to determine if the diagram is correct or wrong, and calculates the confidence of the prediction. If the confidence is below the binary threshold, it returns a response indicating a low confidence wrong answer. If the prediction is correct, it returns a response indicating a correct answer. If the prediction is wrong, it proceeds to perform issue type classification using the loaded type model to identify the specific issue with the diagram, and returns a response with the identified issue type and expected correction based on the mappings defined in the CSV file. This method provides detailed feedback on the correctness of the diagram and any issues detected, along with suggestions for correction.
            return {
                "success": True,
                "question_no": qno,
                "question_text": question_text,
                "question_code": question_code,
                "pred_correct": False,
                "correct_probability": round(conf, 4),
                "pred_issue_text": "LowConfidenceWrong",
                "pred_issue_confidence": round(conf, 4),
                "issue_description": "❌ Wrong Answer (low confidence)",
                "expected_correction": "Please re-check the diagram structure for this question and upload again.",
                "cross_question_mismatch": False,
                "cross_question_mismatch_reason": "",
                "matched_example": None,
                "nearest_correct": None,
                "nearest_wrong": None,
                "nearest_other_question_correct": None,
            }

        if pred == 1:  # The  uploaded image file and a question number, and returns a dictionary containing the prediction results. It first parses the question number to find the corresponding question ID, prepares the image for model input, and retrieves the question text and code. It then performs binary classification using the loaded binary model to determine if the diagram is correct or wrong, and calculates the confidence of the prediction. If the confidence is below the binary threshold, it returns a response indicating a low confidence wrong answer. If the prediction is correct, it returns a response indicating a correct answer. If the prediction is wrong, it proceeds to perform issue type classification using the loaded type model to identify the specific issue with the diagram, and returns a response with the identified issue type and expected correction based on the mappings defined in the CSV file. This method provides detailed feedback on the correctness of the diagram and any issues detected, along with suggestions for correction.
            return {
                "success": True,
                "question_no": qno,
                "question_text": question_text,
                "question_code": question_code,
                "pred_correct": True,
                "correct_probability": round(conf, 4),
                "pred_issue_text": "__CORRECT__",
                "pred_issue_confidence": round(conf, 4),
                "issue_description": "",
                "expected_correction": "",
                "cross_question_mismatch": False,
                "cross_question_mismatch_reason": "",
                "matched_example": None,
                "nearest_correct": None,
                "nearest_wrong": None,
                "nearest_other_question_correct": None,
            }

        # ---------- Stage 2 (Wrong Type) ----------
        type_model, type_names = self._load_type_model(qid)
        if not type_model or not type_names:
            return {
                "success": True,
                "question_no": qno,
                "question_text": question_text,
                "question_code": question_code,
                "pred_correct": False,
                "correct_probability": round(conf, 4),
                "pred_issue_text": "UnknownWrong",
                "pred_issue_confidence": round(conf, 4),
                "issue_description": "❌ Wrong Answer",
                "expected_correction": "Compare with the correct ER/flowchart structure for this question.",
                "cross_question_mismatch": False,
                "cross_question_mismatch_reason": "",
                "matched_example": None,
                "nearest_correct": None,
                "nearest_wrong": None,
                "nearest_other_question_correct": None,
            }

        tlogits = type_model(x)  # The  uploaded image file and a question number, and returns a dictionary containing the prediction results. It first parses the question number to find the corresponding question ID, prepares the image for model input, and retrieves the question text and code. It then performs binary classification using the loaded binary model to determine if the diagram is correct or wrong, and calculates the confidence of the prediction. If the confidence is below the binary threshold, it returns a response indicating a low confidence wrong answer. If the prediction is correct, it returns a response indicating a correct answer. If the prediction is wrong, it proceeds to perform issue type classification using the loaded type model to identify the specific issue with the diagram, and returns a response with the identified issue type and expected correction based on the mappings defined in the CSV file. This method provides detailed feedback on the correctness of the diagram and any issues detected, along with suggestions for correction.
        tprobs = torch.softmax(tlogits, dim=1).squeeze(0)
        tconf, tidx = torch.max(tprobs, dim=0)
        tconf = float(tconf.item())
        tidx = int(tidx.item())
        wrong_type = type_names[tidx]

        if tconf < self.type_threshold:
            return {
                "success": True,
                "question_no": qno,
                "question_text": question_text,
                "question_code": question_code,
                "pred_correct": False,
                "correct_probability": round(conf, 4),
                "pred_issue_text": "UnknownWrong",
                "pred_issue_confidence": round(tconf, 4),
                "issue_description": "❌ Wrong Answer (unknown issue type)",
                "expected_correction": "Compare with the correct ER/flowchart structure for this question.",
                "cross_question_mismatch": False,
                "cross_question_mismatch_reason": "",
                "matched_example": None,
                "nearest_correct": None,
                "nearest_wrong": None,
                "nearest_other_question_correct": None,
            }

        corr = self._get_correction(qid, wrong_type)
        if not corr:
            return {
                "success": True,
                "question_no": qno,
                "question_text": question_text,
                "question_code": question_code,
                "pred_correct": False,
                "correct_probability": round(conf, 4),
                "pred_issue_text": wrong_type,
                "pred_issue_confidence": round(tconf, 4),
                "issue_description": "❌ Wrong Answer (no mapping found)",
                "expected_correction": "Compare with the correct ER/flowchart structure for this question.",
                "cross_question_mismatch": False,
                "cross_question_mismatch_reason": "",
                "matched_example": None,
                "nearest_correct": None,
                "nearest_wrong": None,
                "nearest_other_question_correct": None,
            }

        return {
            "success": True,
            "question_no": qno,
            "question_text": question_text,
            "question_code": question_code,
            "pred_correct": False,
            "correct_probability": round(conf, 4),
            "pred_issue_text": wrong_type,
            "pred_issue_confidence": round(tconf, 4),
            "issue_description": corr.get("issue_description", ""),
            "expected_correction": corr.get("expected_correction", ""),
            "cross_question_mismatch": False,
            "cross_question_mismatch_reason": "",
            "matched_example": None,
            "nearest_correct": None,
            "nearest_wrong": None,
            "nearest_other_question_correct": None,
        }


# ✅ Backward compatible name (so old imports won't break)
DiagramPredictor = QWiseDiagramPredictor


# ============================================================
# Flask app factory
# ============================================================
def now_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def create_mcq_diagram_app(   # The create_mcq_diagram_app function is a factory function that creates and configures a Flask application for the MCQ diagram prediction API. It takes several optional parameters for configuring the paths to models, artifacts, and data files. The function sets up the necessary configurations and environment variables, and initializes the Flask app with the appropriate routes and handlers for serving the MCQ diagram prediction functionality. This allows for easy deployment of the API with customizable configurations based on the provided parameters or environment variables.
    models_dir: str = str(DEFAULT_MODELS_DIR),
    artifacts_dir: Optional[str] = None,     # not used now, kept for signature compatibility
    mcq_csv: Optional[str] = None,
    mcq_model_path: Optional[str] = None,
) -> Flask:
    models_dir = str(models_dir)
    MODELS_DIR = Path(models_dir)

    # ---------- MCQ paths ----------
    CSV_PATH = mcq_csv or str(MODELS_DIR / "mcq.csv")
    MCQ_MODEL_PATH = mcq_model_path or str(MODELS_DIR / "latest_mcq" / "best_model.joblib")   # The create_mcq_diagram_app function is a factory function that creates and configures a Flask application for the MCQ diagram prediction API. It takes several optional parameters for configuring the paths to models, artifacts, and data files. The function sets up the necessary configurations and environment variables, and initializes the Flask app with the appropriate routes and handlers for serving the MCQ diagram prediction functionality. This allows for easy deployment of the API with customizable configurations based on the provided parameters or environment variables.

    QUESTION_COL = os.environ.get("MCQ_QUESTION_COL", "question")   # The create_mcq_diagram_app function is a factory function that creates and configures a Flask application for the MCQ diagram prediction API. It takes several optional parameters for configuring the paths to models, artifacts, and data files. The function sets up the necessary configurations and environment variables, and initializes the Flask app with the appropriate routes and handlers for serving the MCQ diagram prediction functionality. This allows for easy deployment of the API with customizable configurations based on the provided parameters or environment variables.
    CORRECT_COL = os.environ.get("MCQ_CORRECT_COL", "correct_answer")
    MCQ_THRESHOLD = float(os.environ.get("MCQ_THRESHOLD", "0.5"))

    ENABLE_TRAIN_ENDPOINTS = os.environ.get("ENABLE_TRAIN_ENDPOINTS", "0") == "1"  # The create_mcq_diagram_app function is a factory function that creates and configures a Flask application for the MCQ diagram prediction API. It takes several optional parameters for configuring the paths to models, artifacts, and data files. The function sets up the necessary configurations and environment variables, and initializes the Flask app with the appropriate routes and handlers for serving the MCQ diagram prediction functionality. This allows for easy deployment of the API with customizable configurations based on the provided parameters or environment variables.
    TRAIN_MCQ_SCRIPT = os.environ.get("TRAIN_MCQ_SCRIPT", "train_mcq_model.py")
    TRAIN_LOCK = Lock()

    # ---------- Q-wise diagram paths ----------
    QWISE_ART_DIR = os.environ.get("DIAGRAM_QWISE_ART_DIR", str(MODELS_DIR / "artifacts_qwise"))
    QWISE_XLSX = os.environ.get("DIAGRAM_QUESTIONS_XLSX", str(MODELS_DIR / "questions.xlsx"))
    QWISE_CORR = os.environ.get("DIAGRAM_CORR_CSV", str(MODELS_DIR / "wronganswer_expected_corrections.csv"))
    BIN_THRESHOLD = float(os.environ.get("DIAGRAM_BIN_THRESHOLD", "0.60"))
    TYPE_THRESHOLD = float(os.environ.get("DIAGRAM_TYPE_THRESHOLD", "0.55"))

    # ---------- MCQ state ----------
    OPTION_COLS = None
    mcq_model = None
    df_mcq = None
    MCQ_INIT_ERROR = None

    # ---------- Diagram predictor ----------
    predictor = None
    PREDICTOR_INIT_ERROR = None

    def load_mcq_dataset_local():  # The load_mcq_dataset_local helper function loads the MCQ dataset from the specified CSV file path. It first checks if the file exists, and if not, it raises a FileNotFoundError. It then attempts to read the CSV file into a pandas DataFrame, trying both the default encoding and "latin1" encoding in case of a UnicodeDecodeError. After loading the DataFrame, it checks if the required columns for questions and correct answers are present, and raises a ValueError if they are missing. It then processes the question and correct answer columns by stripping whitespace and filtering out any empty rows. Finally, it adds a "qid" column as an index for each question and returns the cleaned DataFrame. This function ensures that the MCQ dataset is properly loaded and formatted for use in the API.
        p = Path(CSV_PATH)
        if not p.exists():
            raise FileNotFoundError(f"Cannot find mcq.csv at: {p.resolve()}")
        try:   # The load_mcq_dataset_local helper function loads the MCQ dataset from the specified CSV file path. It first checks if the file exists, and if not, it raises a FileNotFoundError. It then attempts to read the CSV file into a pandas DataFrame, trying both the default encoding and "latin1" encoding in case of a UnicodeDecodeError. After loading the DataFrame, it checks if the required columns for questions and correct answers are present, and raises a ValueError if they are missing. It then processes the question and correct answer columns by stripping whitespace and filtering out any empty rows. Finally, it adds a "qid" column as an index for each question and returns the cleaned DataFrame. This function ensures that the MCQ dataset is properly loaded and formatted for use in the API.
            df = pd.read_csv(p)
        except UnicodeDecodeError:
            df = pd.read_csv(p, encoding="latin1")

        if QUESTION_COL not in df.columns or CORRECT_COL not in df.columns:
            raise ValueError(
                f"CSV must contain '{QUESTION_COL}' and '{CORRECT_COL}'. Available: {list(df.columns)}"
            )

        df[QUESTION_COL] = df[QUESTION_COL].astype(str).str.strip()
        df[CORRECT_COL] = df[CORRECT_COL].astype(str).str.strip()
        df = df[(df[QUESTION_COL] != "") & (df[CORRECT_COL] != "")].reset_index(drop=True)
        df["qid"] = df.index
        return df

    def infer_option_cols_local(df):  # The infer_option_cols_local helper function takes a DataFrame as input and infers which columns in the DataFrame correspond to the answer options for the MCQ questions. It first checks if the OPTION_COLS variable is already set, and if so, it returns the cached option columns. If not, it iterates through the columns of the DataFrame and identifies candidate columns that are of object type and are not the question column, correct answer column, or "qid" column. If no candidate option columns are found, it raises a ValueError. Otherwise, it caches the identified option columns in the OPTION_COLS variable and returns them. This function allows the API to dynamically determine which columns in the dataset contain the answer options for each question.
        nonlocal OPTION_COLS
        if OPTION_COLS is not None:
            return OPTION_COLS

        candidates = []  # The infer_option_cols_local helper function takes a DataFrame as input and infers which columns in the DataFrame correspond to the answer options for the MCQ questions. It first checks if the OPTION_COLS variable is already set, and if so, it returns the cached option columns. If not, it iterates through the columns of the DataFrame and identifies candidate columns that are of object type and are not the question column, correct answer column, or "qid" column. If no candidate option columns are found, it raises a ValueError. Otherwise, it caches the identified option columns in the OPTION_COLS variable and returns them. This function allows the API to dynamically determine which columns in the dataset contain the answer options for each question.
        for col in df.columns:
            if col in [QUESTION_COL, CORRECT_COL, "qid"]:
                continue
            if df[col].dtype == "object":
                candidates.append(col)

        if not candidates:  # The infer_option_cols_local helper function takes a DataFrame as input and infers which columns in the DataFrame correspond to the answer options for the MCQ questions. It first checks if the OPTION_COLS variable is already set, and if so, it returns the cached option columns. If not, it iterates through the columns of the DataFrame and identifies candidate columns that are of object type and are not the question column, correct answer column, or "qid" column. If no candidate option columns are found, it raises a ValueError. Otherwise, it caches the identified option columns in the OPTION_COLS variable and returns them. This function allows the API to dynamically determine which columns in the dataset contain the answer options for each question.
            raise ValueError("Could not infer option columns.")
        OPTION_COLS = candidates
        return OPTION_COLS

    def get_options_for_row_local(row):  # The get_options_for_row_local helper function takes a row from the MCQ DataFrame as input and extracts the answer options for that question. It first retrieves the correct answer from the specified correct answer column and adds it to the options list if it is not empty. Then, it iterates through the identified option columns and adds any non-empty and non-duplicate options to the list. Finally, it shuffles the options randomly and returns the list of options for that question. This function allows the API to provide a randomized list of answer options for each question when serving the quiz endpoint.
        correct = str(row[CORRECT_COL]).strip()
        options = []
        if correct:
            options.append(correct)
        for col in OPTION_COLS:
            if col not in row:
                continue
            val = row[col]
            if pd.isna(val):
                continue
            txt = str(val).strip()
            if txt and txt not in options:
                options.append(txt)
        random.shuffle(options)
        return options

    def load_mcq_model_local():  # The load_mcq_model_local helper function loads the MCQ prediction model from the specified file path. It first checks if the model is already cached in the mcq_model variable, and if so, it returns the cached model. If not, it checks if the model file exists at the specified path, and if not, it sets the mcq_model variable to None and returns None. If the file exists, it attempts to load the model using joblib.load, and if successful, it caches the loaded model in the mcq_model variable and returns it. If there is an error during loading, it sets mcq_model to None and returns None. This function allows for efficient loading of the MCQ prediction model when needed for making predictions on submitted answers.
        nonlocal mcq_model
        p = Path(MCQ_MODEL_PATH)
        if not p.exists():
            mcq_model = None
            return None
        try:
            mcq_model = joblib.load(p)
            return mcq_model
        except Exception:
            mcq_model = None
            return None

    def mcq_pair_text_local(question: str, candidate: str) -> str:  # The mcq_pair_text_local helper function takes a question and a candidate answer as input and concatenates them with a separator token. This formatted text is used as input for the MCQ prediction model. This function allows the API to prepare the input text for making predictions on the correctness of each answer option.
        return f"{str(question).strip()} [SEP] {str(candidate).strip()}"

    def sigmoid_local(x: float) -> float:  # The sigmoid_local helper function takes a float input and applies the sigmoid function to it, which is commonly used to convert a raw score or logit into a probability between 0 and 1. The function uses the math.exp function to calculate the exponential of the negative input, and returns the result of the sigmoid function. If there is any exception during the calculation (e.g., overflow), it catches the exception and returns 0.0 as a fallback. This function allows the API to convert model outputs into probabilities for making threshold-based predictions on answer correctness.
        import math
        try:
            return 1.0 / (1.0 + math.exp(-x))
        except Exception:
            return 0.0

    def mcq_predict_is_correct_local(question: str, candidate: str):   # The mcq_predict_is_correct_local helper function takes a question and a candidate answer as input and uses the loaded MCQ prediction model to determine if the candidate answer is correct for the given question. It first checks if the MCQ model is loaded, and if not, it returns None with an error message. It then prepares the input text by concatenating the question and candidate answer, and attempts to make a prediction using the model. If the prediction is successful, it determines if the predicted label indicates a correct answer. It also tries to calculate the confidence of the prediction using either predict_proba or decision_function methods of the model, applying a sigmoid function if necessary. Finally, it returns whether the answer is predicted to be correct, the confidence score, and the method used for prediction. This function allows the API to evaluate each submitted answer option against the question using the trained MCQ prediction model.
        if mcq_model is None:
            return None, None, "no_model"

        text = mcq_pair_text_local(question, candidate)

        try:
            pred = int(mcq_model.predict([text])[0])
            is_correct = (pred == 1)
        except Exception:
            return None, None, "model_error"

        conf = None
        if hasattr(mcq_model, "predict_proba"):
            try:
                proba = mcq_model.predict_proba([text])[0]
                if len(proba) >= 2:
                    conf = float(proba[1])
            except Exception:
                conf = None
        elif hasattr(mcq_model, "decision_function"):
            try:
                score = mcq_model.decision_function([text])[0]
                conf = float(sigmoid_local(float(score)))
            except Exception:
                conf = None

        return is_correct, conf, "mcq_ml"

    # ---- create flask ----
    fl = Flask(__name__)
    CORS(fl)

    # ---- init predictor ----
    try:   # The initialization of the QWiseDiagramPredictor is wrapped in a try-except block to catch any exceptions that may occur during the loading of models, artifacts, or data files. If the initialization is successful, the predictor variable will hold an instance of the QWiseDiagramPredictor class, which can be used for making predictions on uploaded diagram images. If there is an error during initialization (e.g., missing files, model loading issues), the predictor variable will be set to None, and the error message will be stored in the PREDICTOR_INIT_ERROR variable. This allows the API to handle cases where the diagram prediction functionality may not be available due to initialization issues, and provide appropriate error responses when users attempt to use the diagram prediction endpoints.
        predictor = QWiseDiagramPredictor(
            art_dir=QWISE_ART_DIR,
            questions_xlsx=QWISE_XLSX,
            corr_csv=QWISE_CORR,
            bin_threshold=BIN_THRESHOLD,
            type_threshold=TYPE_THRESHOLD,
        )
    except Exception as e:   # The initialization of the QWiseDiagramPredictor is wrapped in a try-except block to catch any exceptions that may occur during the loading of models, artifacts, or data files. If the initialization is successful, the predictor variable will hold an instance of the QWiseDiagramPredictor class, which can be used for making predictions on uploaded diagram images. If there is an error during initialization (e.g., missing files, model loading issues), the predictor variable will be set to None, and the error message will be stored in the PREDICTOR_INIT_ERROR variable. This allows the API to handle cases where the diagram prediction functionality may not be available due to initialization issues, and provide appropriate error responses when users attempt to use the diagram prediction endpoints.
        predictor = None
        PREDICTOR_INIT_ERROR = str(e)

    # ---- init mcq ----
    try:  # The initialization of the MCQ dataset and model is also wrapped in a try-except block to handle any exceptions that may occur during the loading of the dataset or the model. It first attempts to load the MCQ dataset using the load_mcq_dataset_local function, which reads the specified CSV file and processes it into a DataFrame. It then calls the infer_option_cols_local function to determine which columns in the DataFrame correspond to answer options. Finally, it attempts to load the MCQ prediction model using the load_mcq_model_local function. If all steps are successful, the df_mcq variable will hold the loaded dataset, and the mcq_model variable will hold the loaded model. If there is any error during this process (e.g., file not found, missing columns, model loading issues), it catches the exception, stores the error message in MCQ_INIT_ERROR, and sets df_mcq and mcq_model to None. This allows the API to handle cases where the MCQ functionality may not be available due to initialization issues, and provide appropriate error responses when users attempt to use the quiz or submit endpoints.
        df_mcq = load_mcq_dataset_local()
        infer_option_cols_local(df_mcq)
        load_mcq_model_local()
    except Exception as e:   # The initialization of the MCQ dataset and model is also wrapped in a try-except block to handle any exceptions that may occur during the loading of the dataset or the model. It first attempts to load the MCQ dataset using the load_mcq_dataset_local function, which reads the specified CSV file and processes it into a DataFrame. It then calls the infer_option_cols_local function to determine which columns in the DataFrame correspond to answer options. Finally, it attempts to load the MCQ prediction model using the load_mcq_model_local function. If all steps are successful, the df_mcq variable will hold the loaded dataset, and the mcq_model variable will hold the loaded model. If there is any error during this process (e.g., file not found, missing columns, model loading issues), it catches the exception, stores the error message in MCQ_INIT_ERROR, and sets df_mcq and mcq_model to None. This allows the API to handle cases where the MCQ functionality may not be available due to initialization issues, and provide appropriate error responses when users attempt to use the quiz or submit endpoints.
        MCQ_INIT_ERROR = str(e)
        df_mcq = None
        mcq_model = None

    # =========================
    # MCQ endpoints (unchanged)
    # =========================
    @fl.get("/quiz")   # The /quiz endpoint serves a random sample of MCQ questions from the loaded dataset. It first checks if the MCQ dataset is loaded, and if not, it returns an error response with the initialization error message. It then attempts to parse the "n" query parameter to determine how many questions to return, defaulting to 10 if the parameter is missing or invalid. It samples n questions randomly from the dataset, and for each question, it constructs a dictionary containing the question ID, question text, and a list of answer options (shuffled randomly). Finally, it returns a JSON response containing the list of sampled questions. This endpoint allows users to retrieve a set of MCQ questions for taking quizzes.
    def quiz():
        nonlocal df_mcq
        if df_mcq is None:
            return jsonify({"error": "MCQ dataset not loaded", "detail": MCQ_INIT_ERROR}), 500

        try:  # The /quiz endpoint serves a random sample of MCQ questions from the loaded dataset. It first checks if the MCQ dataset is loaded, and if not, it returns an error response with the initialization error message. It then attempts to parse the "n" query parameter to determine how many questions to return, defaulting to 10 if the parameter is missing or invalid. It samples n questions randomly from the dataset, and for each question, it constructs a dictionary containing the question ID, question text, and a list of answer options (shuffled randomly). Finally, it returns a JSON response containing the list of sampled questions. This endpoint allows users to retrieve a set of MCQ questions for taking quizzes.
            n = int(request.args.get("n", 10))
        except ValueError:
            n = 10
        n = max(1, min(n, len(df_mcq)))

        sample_df = df_mcq.sample(n=n, random_state=None)
        questions = []
        for _, row in sample_df.iterrows():
            qid = int(row["qid"])
            questions.append({
                "id": qid,
                "question": str(row[QUESTION_COL]),
                "options": get_options_for_row_local(row),
            })
        return jsonify({"questions": questions})

    @fl.post("/submit")   # The /submit endpoint accepts a JSON payload containing the user's answers to the MCQ questions. It first checks if the MCQ dataset is loaded, and if not, it returns an error response with the initialization error message. It then retrieves the list of answers from the request body, and validates that it is a non-empty list. For each submitted answer, it extracts the question ID and the selected answer, and checks if the question ID exists in the dataset. If it does, it retrieves the corresponding question text and correct answer from the dataset. It then uses the mcq_predict_is_correct_local function to determine if the selected answer is correct according to the MCQ prediction model, and calculates the confidence of the prediction. If the model is not available or there is an error during prediction, it falls back to a direct string match between the selected answer and the correct answer. It accumulates the results for each question, including whether it was correct, the method used for prediction, and any confidence scores. Finally, it returns a JSON response containing the total score, total number of questions, and detailed results for each submitted answer. This endpoint allows users to submit their answers for evaluation and receive feedback on their performance.
    def submit():
        nonlocal df_mcq
        if df_mcq is None:
            return jsonify({"error": "MCQ dataset not loaded", "detail": MCQ_INIT_ERROR}), 500

        data = request.get_json(force=True, silent=True) or {}
        answers = data.get("answers", [])

        if not isinstance(answers, list) or len(answers) == 0:
            return jsonify({"error": "No answers provided"}), 400

        results = []
        score = 0

        for item in answers:  # The /submit endpoint accepts a JSON payload containing the user's answers to the MCQ questions. It first checks if the MCQ dataset is loaded, and if not, it returns an error response with the initialization error message. It then retrieves the list of answers from the request body, and validates that it is a non-empty list. For each submitted answer, it extracts the question ID and the selected answer, and checks if the question ID exists in the dataset. If it does, it retrieves the corresponding question text and correct answer from the dataset. It then uses the mcq_predict_is_correct_local function to determine if the selected answer is correct according to the MCQ prediction model, and calculates the confidence of the prediction. If the model is not available or there is an error during prediction, it falls back to a direct string match between the selected answer and the correct answer. It accumulates the results for each question, including whether it was correct, the method used for prediction, and any confidence scores. Finally, it returns a JSON response containing the total score, total number of questions, and detailed results for each submitted answer. This endpoint allows users to submit their answers for evaluation and receive feedback on their performance.
            try:
                qid = int(item["id"])
                selected = str(item["selected"]).strip()
            except Exception:
                continue

            if qid not in df_mcq["qid"].values:
                continue

            row = df_mcq.loc[df_mcq["qid"] == qid].iloc[0]
            question_text = str(row[QUESTION_COL])
            correct_answer = str(row[CORRECT_COL]).strip()

            ml_is_correct, ml_conf, ml_method = mcq_predict_is_correct_local(question_text, selected)  # The /submit endpoint accepts a JSON payload containing the user's answers to the MCQ questions. It first checks if the MCQ dataset is loaded, and if not, it returns an error response with the initialization error message. It then retrieves the list of answers from the request body, and validates that it is a non-empty list. For each submitted answer, it extracts the question ID and the selected answer, and checks if the question ID exists in the dataset. If it does, it retrieves the corresponding question text and correct answer from the dataset. It then uses the mcq_predict_is_correct_local function to determine if the selected answer is correct according to the MCQ prediction model, and calculates the confidence of the prediction. If the model is not available or there is an error during prediction, it falls back to a direct string match between the selected answer and the correct answer. It accumulates the results for each question, including whether it was correct, the method used for prediction, and any confidence scores. Finally, it returns a JSON response containing the total score, total number of questions, and detailed results for each submitted answer. This endpoint allows users to submit their answers for evaluation and receive feedback on their performance.

            if ml_is_correct is None:   # The /submit endpoint accepts a JSON payload containing the user's answers to the MCQ questions. It first checks if the MCQ dataset is loaded, and if not, it returns an error response with the initialization error message. It then retrieves the list of answers from the request body, and validates that it is a non-empty list. For each submitted answer, it extracts the question ID and the selected answer, and checks if the question ID exists in the dataset. If it does, it retrieves the corresponding question text and correct answer from the dataset. It then uses the mcq_predict_is_correct_local function to determine if the selected answer is correct according to the MCQ prediction model, and calculates the confidence of the prediction. If the model is not available or there is an error during prediction, it falls back to a direct string match between the selected answer and the correct answer. It accumulates the results for each question, including whether it was correct, the method used for prediction, and any confidence scores. Finally, it returns a JSON response containing the total score, total number of questions, and detailed results for each submitted answer. This endpoint allows users to submit their answers for evaluation and receive feedback on their performance.
                is_correct = (selected == correct_answer)
                method = "direct_match"
                confidence = None
            else:
                if ml_conf is not None:
                    is_correct = (ml_conf >= MCQ_THRESHOLD)
                    confidence = ml_conf
                    method = f"{ml_method}_threshold"
                else:
                    is_correct = bool(ml_is_correct)
                    confidence = None
                    method = ml_method

            if is_correct:
                score += 1

            results.append({
                "id": qid,
                "question": question_text,
                "selected": selected,
                "correct_answer": correct_answer,
                "is_correct": bool(is_correct),
                "method": method,
                "confidence": confidence,
            })

        return jsonify({"score": score, "total": len(results), "results": results})

    @fl.post("/admin/train/mcq")   # The /admin/train/mcq endpoint allows for retraining the MCQ prediction model using the specified training script. It first checks if the training endpoints are enabled through the ENABLE_TRAIN_ENDPOINTS configuration, and if not, it returns a 403 Forbidden response. If training is allowed, it acquires a lock to ensure that only one training process can run at a time. It then creates an output directory for the training run, and constructs a command to execute the training script with the appropriate arguments for the CSV dataset, question column, correct answer column, and output directory. It runs the training script as a subprocess and captures its output. If the training is successful and produces a new model file, it updates the MCQ_MODEL_PATH to point to the new model and reloads it. Finally, it returns a JSON response containing information about the training run, including whether it was successful, any output or error messages from the training script, and the path to the new model if applicable. This endpoint allows administrators to retrain the MCQ prediction model with updated data or configurations as needed.
    def train_mcq():
        if not ENABLE_TRAIN_ENDPOINTS:
            return jsonify({"error": "Training endpoints disabled. Set ENABLE_TRAIN_ENDPOINTS=1"}), 403

        with TRAIN_LOCK:
            outdir = MODELS_DIR / "mcq_runs" / now_stamp()
            outdir.mkdir(parents=True, exist_ok=True)

            cmd = [
                sys.executable, TRAIN_MCQ_SCRIPT,
                "--csv", CSV_PATH,
                "--question_col", QUESTION_COL,
                "--correct_col", CORRECT_COL,
                "--outdir", str(outdir)
            ]
            p = subprocess.run(cmd, capture_output=True, text=True, check=False)
            ok = (p.returncode == 0)

            model_path = str(outdir / "best_model.joblib")
            if ok and Path(model_path).exists():
                nonlocal MCQ_MODEL_PATH
                MCQ_MODEL_PATH = model_path
                load_mcq_model_local()

            return jsonify({
                "ok": ok,
                "returncode": p.returncode,
                "outdir": str(outdir),
                "mcq_model_path": MCQ_MODEL_PATH,
                "stdout_tail": p.stdout[-2000:],
                "stderr_tail": p.stderr[-2000:],
            }), (200 if ok else 500)

    # =========================
    # Diagram endpoints (NEW)
    # =========================
    @fl.get("/health")
    def health():
        if predictor is None:
            return jsonify({"success": False, "error": PREDICTOR_INIT_ERROR or "Predictor not initialized"}), 500
        return jsonify({
            "success": True,
            "device": str(predictor.device),
            "question_count": len(predictor.question_ids),
            "artifacts_dir": predictor.art_dir,
            "bin_threshold": predictor.bin_threshold,
            "type_threshold": predictor.type_threshold,
            "mcq_loaded": bool(df_mcq is not None),
            "mcq_model_loaded": bool(mcq_model is not None),
            "mcq_error": MCQ_INIT_ERROR,
        })

    @fl.get("/questions")
    def questions():
        if predictor is None:
            return jsonify({"success": False, "error": PREDICTOR_INIT_ERROR or "Predictor not initialized"}), 500
        qs = predictor.get_all_questions()
        return jsonify({"success": True, "count": len(qs), "questions": qs})

    @fl.get("/question_random")
    def question_random():
        if predictor is None:
            return jsonify({"success": False, "error": PREDICTOR_INIT_ERROR or "Predictor not initialized"}), 500
        return jsonify({"success": True, "question": predictor.get_random_question()})

    @fl.post("/predict_json")
    def predict_json():
        if predictor is None:
            return jsonify({"success": False, "error": PREDICTOR_INIT_ERROR or "Predictor not initialized"}), 500

        question_no_raw = request.form.get("question_no")
        image_file = request.files.get("image")

        if question_no_raw is None or str(question_no_raw).strip() == "":
            return jsonify({"success": False, "error": "question_no is required"}), 400

        try:
            question_no = int(question_no_raw)
        except ValueError:
            return jsonify({"success": False, "error": "question_no must be an integer"}), 400

        if image_file is None or image_file.filename == "":
            return jsonify({"success": False, "error": "image file is required"}), 400

        result = predictor.predict(image_file, question_no)
        return jsonify(result), (200 if result.get("success") else 400)

    return fl
