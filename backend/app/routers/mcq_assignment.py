
import io 
import os  
import random   
import re      
from datetime import datetime, timezone           
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.routers.auth import get_current_user
from app.core.db import col

# ✅ IMPORTANT: import DiagramPredictor (aliased to QWiseDiagramPredictor)
from app.services.mcq_diagram import DiagramPredictor


router = APIRouter(prefix="/api/mcq-diagram", tags=["mcq-diagram"])  

_STATE: Dict[str, Any] = {
    "loaded": False,
    "mcq_df": None,
    "question_col": "question",
    "correct_col": "correct_answer",
    "option_cols": [],
    "predictor": None,
    "init_error": None,
    "predictor_error": None,
}


class McqAnswerItem(BaseModel):  # Represents an individual answer to an MCQ question, containing the question ID and the user's selected answer. This is used in the MCQ submission endpoint to receive the user's answers for evaluation.
    id: int
    selected: str


class McqSubmitIn(BaseModel):  # Represents the input data for submitting MCQ answers, containing a list of McqAnswerItem objects. This is the expected format of the request body when the user submits their answers to the MCQ questions in an attempt.
    answers: List[McqAnswerItem]


def _now() -> datetime:   # A helper function to get the current datetime in UTC timezone. This is used throughout the code to set timestamps for attempt creation, updates, and completion in a consistent timezone-aware manner.
    return datetime.now(timezone.utc)


def _safe_iso(value: Any) -> Optional[str]:   # A helper function to safely convert a datetime value to an ISO 8601 string in UTC timezone. If the input value is not a datetime object, it returns None. This is used when serializing attempt data to ensure that all timestamps are consistently formatted and timezone-aware.
    return value.astimezone(timezone.utc).isoformat() if isinstance(value, datetime) else None


def _parse_question_no(value: Any) -> Optional[int]:   # A helper function to parse a question number from various possible formats. It accepts integers directly, or strings that may contain the question number in different formats (e.g., "Question01", "Q1", "1"). It uses regular expressions to extract the trailing digits or any digits from the string. If it cannot parse a valid question number, it returns None. This is used to determine the question number for diagram questions, which may be needed for prediction and categorization.
    if value is None:
        return None
    if isinstance(value, int):
        return value

    text = str(value).strip()
    if not text:
        return None

    try:
        return int(text)
    except Exception:
        pass

    # Accept legacy ids such as "Question01" by extracting trailing digits.
    m = re.search(r"(\d+)$", text)
    if m:
        return int(m.group(1))

    m = re.search(r"(\d+)", text)
    if m:
        return int(m.group(1))

    return None


def _diagram_type_of(q: Dict[str, Any]) -> str:   # A helper function to determine the type of a diagram question (e.g., "ER" for Entity Relationship, "FLOWCHART" for flowchart questions) based on the question's code and text. It checks for specific keywords in the question code and text to categorize the diagram type. If it cannot determine the type based on keywords, it falls back to using the question number (assuming a common training layout where questions 1-5 are ER and 6+ are Flowchart). If it still cannot determine the type, it returns "UNKNOWN". This is used when selecting diagram questions for an attempt to ensure a mix of different types of diagram questions.
    code = str(q.get("question_code") or "").strip().lower()
    text = str(q.get("question_text") or "").strip().lower()
    qno = _parse_question_no(q.get("question_no"))

    if "er" in code or "entity relationship" in text or " er " in f" {text} ":
        return "ER"
    if "flow" in code or "flowchart" in text or "flow chart" in text:
        return "FLOWCHART"

    # Fallback for common training layout (Q1-5 ER, Q6+ Flowchart).
    if qno is not None:
        return "ER" if qno <= 5 else "FLOWCHART"

    return "UNKNOWN"

#----------------------- INTERNAL STATE AND HELPERS -----------------------
def _models_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "assets" / "models"


def _ensure_loaded() -> None:  # A function to ensure that the MCQ dataset and diagram predictor model are loaded into memory. It checks if the state is already loaded, and if not, it attempts to load the MCQ dataset from a CSV file and initialize the DiagramPredictor with the specified artifacts. It also sets up indexes on the MongoDB collection for efficient querying. If there are any errors during loading, it captures the error messages in the state for later retrieval when handling requests.
    if _STATE["loaded"]:
        return

    models_dir = _models_dir()
    csv_path = models_dir / "mcq.csv"
    question_col = os.getenv("MCQ_QUESTION_COL", "question")
    correct_col = os.getenv("MCQ_CORRECT_COL", "correct_answer")

    # ---------------- MCQ LOAD (UNCHANGED) ----------------
    try:
        try:
            df = pd.read_csv(csv_path)
        except UnicodeDecodeError:
            df = pd.read_csv(csv_path, encoding="latin1")

        if question_col not in df.columns or correct_col not in df.columns:
            raise RuntimeError(f"CSV missing '{question_col}' or '{correct_col}'")

        df[question_col] = df[question_col].astype(str).str.strip()  # Strip whitespace and ensure question column is string type
        df[correct_col] = df[correct_col].astype(str).str.strip()
        df = df[(df[question_col] != "") & (df[correct_col] != "")].reset_index(drop=True)
        df["qid"] = df.index.astype(int)

        option_cols = []   # Identify option columns without relying on pandas dtype names.
        for c in df.columns:
            if c in {question_col, correct_col, "qid"}:
                continue
            name = str(c).strip().lower()
            if name in {"label"} or name.startswith("unnamed"):
                continue
            non_empty = df[c].fillna("").astype(str).str.strip().ne("").any()
            if non_empty and (name.startswith("option") or name.startswith("choice") or name.startswith("answer")):
                option_cols.append(c)
        if not option_cols:
            raise RuntimeError("No MCQ option columns found")

        _STATE["mcq_df"] = df
        _STATE["question_col"] = question_col
        _STATE["correct_col"] = correct_col
        _STATE["option_cols"] = option_cols
        _STATE["init_error"] = None
    except Exception as e:
        _STATE["init_error"] = str(e)

    # ---------------- DIAGRAM LOAD (Q-wise Predictor) ----------------
    try:
        qwise_art = os.getenv("DIAGRAM_QWISE_ART_DIR", str(models_dir / "artifacts_qwise"))
        qwise_xlsx = os.getenv("DIAGRAM_QUESTIONS_XLSX", str(models_dir / "questions.xlsx"))
        qwise_corr = os.getenv("DIAGRAM_CORR_CSV", str(models_dir / "wronganswer_expected_corrections.csv"))
        bin_th = float(os.getenv("DIAGRAM_BIN_THRESHOLD", "0.60"))
        type_th = float(os.getenv("DIAGRAM_TYPE_THRESHOLD", "0.55"))

        _STATE["predictor"] = DiagramPredictor(  # Initialize the DiagramPredictor with the specified artifact directory, questions Excel file, corrections CSV file, and thresholds for binary classification and type classification. This predictor will be used to evaluate the uploaded diagram images against the expected answers for the assigned diagram questions.
            art_dir=qwise_art,
            questions_xlsx=qwise_xlsx,
            corr_csv=qwise_corr,
            bin_threshold=bin_th,
            type_threshold=type_th,
        )
        _STATE["predictor_error"] = None
    except Exception as e:
        _STATE["predictor"] = None
        _STATE["predictor_error"] = str(e)

    _STATE["loaded"] = True

    try:   # Ensure indexes on the MongoDB collection for efficient querying by user_id, status, and timestamps. This allows for fast retrieval of attempts based on the user's active attempt and completed attempts, which is critical for the performance of the API endpoints.
        attempts = col("mcq_diagram_attempts")
        attempts.create_index([("user_id", 1), ("status", 1), ("updated_at", -1)])
        attempts.create_index([("user_id", 1), ("created_at", -1)])
    except Exception:
        pass


def _attempts_col():  # A helper function to get the MongoDB collection for MCQ diagram attempts. It ensures that the state is loaded before accessing the collection. This is used throughout the code to interact with the database for creating, updating, and retrieving attempt documents.
    _ensure_loaded()
    return col("mcq_diagram_attempts")


def _mcq_df():  # A helper function to get the loaded MCQ dataset as a pandas DataFrame. It ensures that the state is loaded and that the MCQ dataset is available. If the dataset is not loaded, it raises an HTTPException with a 500 status code and includes the initialization error message if available. This function is used whenever the code needs to access the MCQ questions and answers for processing attempts.
    _ensure_loaded()
    if _STATE["mcq_df"] is None:
        raise HTTPException(status_code=500, detail=_STATE["init_error"] or "MCQ dataset not loaded")
    return _STATE["mcq_df"]


def _predictor():   # A helper function to get the initialized DiagramPredictor instance. It ensures that the state is loaded and that the predictor is available. If the predictor is not loaded, it raises an HTTPException with a 500 status code and includes the predictor initialization error message if available. This function is used whenever the code needs to evaluate uploaded diagram images against the expected answers for the assigned diagram questions.
    _ensure_loaded()
    if _STATE["predictor"] is None:
        raise HTTPException(status_code=500, detail=_STATE["predictor_error"] or "Diagram model not loaded")
    return _STATE["predictor"]


def _options_for_row(row: pd.Series) -> List[str]:   # A helper function to extract the list of answer options for an MCQ question from a given row of the MCQ DataFrame. It starts with the correct answer and then adds any additional options from the specified option columns, ensuring that there are no duplicates and that all options are stripped of whitespace. Finally, it shuffles the options to randomize their order before returning them as a list of strings. This is used when preparing the MCQ questions for an attempt to provide the user with a randomized set of answer options.
    options: List[str] = []
    correct = str(row[_STATE["correct_col"]]).strip()
    if correct:
        options.append(correct)
    for c in _STATE["option_cols"]:
        if c not in row:
            continue
        val = row[c]
        if pd.isna(val):
            continue
        txt = str(val).strip()
        if txt and txt not in options:
            options.append(txt)
    random.shuffle(options)
    return options


def _completed_sets(user_id: str) -> Dict[str, set]:   # A helper function to retrieve the sets of completed MCQ question IDs and diagram question numbers for a given user. It queries the database for all completed attempts by the user and collects the MCQ question IDs and diagram question numbers that have been completed across all attempts. This is used when creating a new attempt to ensure that the user is assigned new questions that they have not already completed in previous attempts.
    mcq_done = set()
    diagram_done = set()
    for doc in _attempts_col().find({"user_id": user_id, "status": "completed"}):
        for qid in doc.get("mcq_question_ids", []):
            try:
                mcq_done.add(int(qid))
            except Exception:
                pass

        dqs = doc.get("diagram_questions")
        if not dqs:
            dqs = [doc.get("diagram_question")] if doc.get("diagram_question") else []

        for dq in dqs:   # Loop through the diagram questions in the completed attempt and extract the question numbers to add to the set of completed diagram questions. It uses the _parse_question_no helper function to ensure that it can handle various formats of question numbers. This allows the system to keep track of which diagram questions the user has already completed across all attempts.
            try:
                if dq and dq.get("question_no") is not None:
                    qno = _parse_question_no(dq["question_no"])
                    if qno is not None:
                        diagram_done.add(qno)
            except Exception:
                pass

    return {"mcq": mcq_done, "diagram": diagram_done}


def _active_attempt(user_id: str) -> Optional[Dict[str, Any]]:     # A helper function to retrieve the user's active attempt, which is defined as an attempt that is either in the "mcq_in_progress" or "diagram_pending" status. It queries the database for attempts by the user with these statuses and returns the most recently updated one. This is used in the overview endpoint to show the user's current active attempt and in the start endpoint to determine whether to create a new attempt or reuse the existing active attempt.
    return _attempts_col().find_one(
        {"user_id": user_id, "status": {"$in": ["mcq_in_progress", "diagram_pending"]}},
        sort=[("updated_at", -1)],
    )


def _serialize_attempt(doc: Dict[str, Any]) -> Dict[str, Any]: # A helper function to serialize an attempt document from the database into a format suitable for returning in API responses. It extracts key fields from the document, formats timestamps as ISO strings, and structures the data based on the current status of the attempt (e.g., including MCQ questions and answers if in progress, including results if completed). It also handles both the new "diagram_questions" field (which is a list) and the old "diagram_question" field (which is a single question) to ensure compatibility with different versions of the attempt documents.
    out = {
        "id": str(doc["_id"]),
        "status": doc.get("status"),
        "created_at": _safe_iso(doc.get("created_at")),
        "updated_at": _safe_iso(doc.get("updated_at")),
        "mcq_total": int(doc.get("mcq_total", 0)),
    }

    diagram_questions = doc.get("diagram_questions")   # The code was updated to handle both the new "diagram_questions" field (which is a list) and the old "diagram_question" field (which is a single question). If "diagram_questions" is not present, it checks for "diagram_question" and wraps it in a list if it exists. This ensures that the API can return a consistent format for diagram questions regardless of whether the attempt document uses the old or new schema.
    if not diagram_questions:
        single = doc.get("diagram_question")
        diagram_questions = [single] if single else []

    status = doc.get("status")   # Based on the status of the attempt, the serialization includes different fields in the output. If the status is "mcq_in_progress", it includes the MCQ questions and answers. If the status is "diagram_pending", it includes the MCQ results and the assigned diagram questions. If the status is "completed", it includes all results and timestamps related to both MCQ and diagram stages. This allows the API to provide relevant information based on where the user is in their attempt.
    if status == "mcq_in_progress":
        out["phase"] = "mcq"
        out["mcq"] = {"questions": doc.get("mcq_questions", []), "answers": doc.get("mcq_answers", [])}

    elif status == "diagram_pending":   # If the attempt is in the "diagram_pending" status, it means the user has completed the MCQ stage and is now waiting to submit their diagram answers. In this case, the serialization includes the MCQ results (score, total, and detailed results) as well as the assigned diagram questions. This allows the frontend to show the user their performance on the MCQ section and remind them of the diagram questions they need to answer next.
        out["phase"] = "diagram"
        out["mcq_result"] = {
            "score": int(doc.get("mcq_score", 0)),
            "total": int(doc.get("mcq_total", 0)),
            "results": doc.get("mcq_results", []),
        }
        out["diagram_question"] = diagram_questions[0] if diagram_questions else None
        out["diagram_questions"] = diagram_questions

    elif status == "completed":   # If the attempt is in the "completed" status, it means the user has completed both the MCQ and diagram stages. In this case, the serialization includes all relevant results and timestamps for both stages, allowing the frontend to show a comprehensive report of the user's performance on the entire assignment.
        out["phase"] = "completed"
        out["mcq_result"] = {
            "score": int(doc.get("mcq_score", 0)),
            "total": int(doc.get("mcq_total", 0)),
            "results": doc.get("mcq_results", []),
        }
        out["diagram_question"] = diagram_questions[0] if diagram_questions else None
        out["diagram_questions"] = diagram_questions
        out["diagram_result"] = doc.get("diagram_result")
        out["diagram_results"] = doc.get("diagram_results") or ([doc.get("diagram_result")] if doc.get("diagram_result") else [])
        out["completed_at"] = _safe_iso(doc.get("completed_at"))

    else:
        out["phase"] = "unknown"

    return out


def _attempt_or_404(attempt_id: str, user_id: str) -> Dict[str, Any]:   # A helper function to retrieve an attempt document by its ID and user ID. It attempts to convert the provided attempt_id to a MongoDB ObjectId, and if it fails, it raises a 400 Bad Request error. If the attempt is not found for the given user, it raises a 404 Not Found error. This function is used in the endpoints that need to access a specific attempt by ID to ensure that the attempt exists and belongs to the current user before proceeding with any operations on it.
    try:   # Attempt to convert the provided attempt_id string to a MongoDB ObjectId. If the format of the attempt_id is invalid and cannot be converted, it raises an HTTPException with a 400 status code indicating that the attempt ID is invalid. This is important for ensuring that the API receives a properly formatted ID when trying to access an attempt document in the database.
        oid = ObjectId(attempt_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid attempt id")

    doc = _attempts_col().find_one({"_id": oid, "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Attempt not found")
    return doc


def _create_attempt(user_id: str) -> Dict[str, Any]:   # A helper function to create a new attempt for a user. It selects random MCQ questions and diagram questions based on the user's progress and available questions in the database.
    df = _mcq_df()
    predictor = _predictor()
    completed = _completed_sets(user_id)

    # -------- MCQ choose (unchanged) --------
    remaining_mcq = df[~df["qid"].isin(list(completed["mcq"]))].copy()
    if remaining_mcq.empty:
        raise HTTPException(status_code=409, detail="No new MCQ questions available")

    take_n = min(10, len(remaining_mcq))   # Determine how many MCQ questions to take for the new attempt, which is the minimum of 10 or the number of remaining MCQ questions available. This ensures that if there are fewer than 10 questions left, it will only take as many as are available without causing an error.
    sample = remaining_mcq.sample(n=take_n)

    mcq_questions = []   # Prepare the list of MCQ questions for the attempt by iterating over the sampled questions. For each question, it extracts the question ID, question text, and options using the _options_for_row helper function. It also keeps track of the question IDs in a separate list for easy reference when evaluating answers later. This structured format of questions is used in the API response to provide the frontend with all necessary information to display the MCQ questions to the user.
    mcq_question_ids = []
    for _, row in sample.iterrows():
        qid = int(row["qid"])
        mcq_question_ids.append(qid)
        mcq_questions.append({
            "id": qid,
            "question": str(row[_STATE["question_col"]]),
            "options": _options_for_row(row),
        })

    # -------- Diagram choose 2 (duplicate නොවෙන්න) --------
    diagram_pool: List[Dict[str, Any]] = []
    for q in predictor.get_all_questions():
        qno = _parse_question_no(q.get("question_no"))
        if qno is None or qno in completed["diagram"]:
            continue
        item = dict(q)
        item["question_no"] = qno
        item["diagram_type"] = _diagram_type_of(item)
        diagram_pool.append(item)

    if not diagram_pool:   # If there are no diagram questions available for the user (i.e., all diagram questions have been completed), it raises an HTTPException with a 409 status code indicating that there are no new diagram questions available. This prevents the creation of an attempt that cannot be completed due to lack of available diagram questions.
        raise HTTPException(status_code=409, detail="No new diagram questions available")

    er_pool = [q for q in diagram_pool if q.get("diagram_type") == "ER"]   # Separate the diagram questions into two pools based on their type: one for Entity Relationship (ER) diagrams and one for Flowchart diagrams. This allows the system to attempt to assign a mix of diagram types to the user, ensuring that they get exposure to different types of diagram questions if available.
    flow_pool = [q for q in diagram_pool if q.get("diagram_type") == "FLOWCHART"]

    selected_diagrams: List[Dict[str, Any]] = []   # Prepare the list of selected diagram questions for the attempt. It first tries to select one question from the ER pool and one from the Flowchart pool if they are available, ensuring that the user gets a mix of diagram types. If there are not enough questions in either pool, it fills the remaining slots from the combined diagram pool while ensuring that there are no duplicate question numbers assigned to the user in the same attempt.
    if er_pool:
        selected_diagrams.append(random.choice(er_pool))

    if flow_pool:   # If there are questions available in the Flowchart pool, it randomly selects one and checks if its question number has already been assigned to the user in the selected diagrams. If it has not been assigned yet, it adds it to the selected diagrams. This ensures that the user gets a Flowchart question if available and that there are no duplicate diagram questions assigned in the same attempt.
        flow_q = random.choice(flow_pool)
        if flow_q["question_no"] not in {x["question_no"] for x in selected_diagrams}:
            selected_diagrams.append(flow_q)

    # still <2 => fill
    if len(selected_diagrams) < 2:  # If there are still fewer than 2 diagram questions selected after trying to get one from each type, it fills the remaining slots by iterating through the combined diagram pool and adding questions that have not already been assigned in the selected diagrams. This ensures that the user gets assigned diagram questions up to the maximum of 2, even if there is not a perfect mix of types available, while still avoiding duplicates within the same attempt.
        for q in diagram_pool:
            qno = q["question_no"]
            if qno in {x["question_no"] for x in selected_diagrams}:
                continue
            selected_diagrams.append(q)
            if len(selected_diagrams) >= 2:
                break

    now = _now()   # Get the current datetime to set the created_at and updated_at timestamps for the new attempt document. This ensures that the attempt has accurate timestamps for when it was created and last updated, which is important for tracking the user's progress and for sorting attempts when retrieving them from the database.
    diagram_questions = [{
        "question_no": q["question_no"],
        "question_code": q.get("question_code"),
        "question_text": q.get("question_text"),
        "diagram_type": q.get("diagram_type"),
    } for q in selected_diagrams]

    doc = {   # Prepare the attempt document to be inserted into the database. It includes the user ID, initial status, timestamps, assigned MCQ questions and their IDs, and assigned diagram questions. The document is structured to allow for easy updates as the user progresses through the attempt (e.g., updating answers, results, and status). This document will be inserted into the MongoDB collection to create a new attempt record for the user.
        "user_id": user_id,
        "status": "mcq_in_progress",
        "created_at": now,
        "updated_at": now,
        "mcq_total": take_n,
        "mcq_questions": mcq_questions,
        "mcq_question_ids": mcq_question_ids,
        "mcq_answers": [],
        "mcq_results": [],
        "mcq_score": 0,
        "diagram_question": diagram_questions[0],
        "diagram_questions": diagram_questions,
        "diagram_result": None,
        "diagram_results": [],
    }

    res = _attempts_col().insert_one(doc)
    doc["_id"] = res.inserted_id
    return doc


@router.get("/overview")   # An endpoint to provide an overview of the MCQ and diagram assignment for the current user. It retrieves the MCQ dataset, diagram predictor, completed question sets, and active attempt for the user to compile a summary of the assignment status, including counts of total questions, completed questions, and details of the active attempt if it exists. This allows the frontend to display a dashboard or overview page for the user to see their progress and the requirements of the assignment.
def overview(user=Depends(get_current_user)):
    df = _mcq_df()
    predictor = _predictor()
    completed = _completed_sets(user["id"])
    active = _active_attempt(user["id"])

    return {   # The overview response includes the title of the assignment, the course name, the current status (in progress or not started), published and deadline dates, instructions for the assignment, counts of questions per attempt and total available questions, counts of completed questions, and details of the active attempt if it exists. This structured response provides all necessary information for the frontend to display an informative overview to the user about their MCQ and diagram assignment.
        "title": "2026 A/L Batch",
        "course": "Information Technology",
        "status": "in_progress" if active else "not_started",
        "published_date": "2026-02-15",
        "deadline": "2026-02-28",
        "instructions": "Complete 10 random MCQ questions plus two diagram uploads (one ER and one FlowChart when available).",
        "counts": {
            "mcq_questions_per_attempt": 10,
            "diagram_questions_per_attempt": 2,
            "mcq_total_pool": int(len(df)),
            "diagram_total_pool": int(len(predictor.get_all_questions())),
            "mcq_completed": len(completed["mcq"]),
            "diagram_completed": len(completed["diagram"]),
        },
        "active_attempt": _serialize_attempt(active) if active else None,
    }


@router.post("/start")  # An endpoint to start a new attempt for the current user. It first checks if the user already has an active attempt (either in "mcq_in_progress" or "diagram_pending" status). If an active attempt exists, it returns that attempt without creating a new one, allowing the user to continue where they left off. If there is no active attempt, it creates a new attempt using the _create_attempt helper function and returns the newly created attempt. This ensures that users can only have one active attempt at a time and prevents them from accidentally creating multiple attempts.
def start(user=Depends(get_current_user)):
    active = _active_attempt(user["id"])
    if active:
        return {"attempt": _serialize_attempt(active), "reused_active_attempt": True}
    doc = _create_attempt(user["id"])   # If there is no active attempt, it creates a new attempt for the user using the _create_attempt helper function and returns the serialized attempt in the response. This allows the user to start a new attempt with assigned MCQ and diagram questions if they do not already have an active attempt.
    return {"attempt": _serialize_attempt(doc), "reused_active_attempt": False}


@router.get("/attempt/{attempt_id}")  # An endpoint to retrieve the details of a specific attempt by its ID for the current user. It uses the _attempt_or_404 helper function to ensure that the attempt exists and belongs to the user, and then returns the serialized attempt data in the response. This allows the frontend to display the details of a specific attempt when requested by the user.
def get_attempt(attempt_id: str, user=Depends(get_current_user)):
    doc = _attempt_or_404(attempt_id, user["id"])
    return {"attempt": _serialize_attempt(doc)}


@router.post("/attempt/{attempt_id}/mcq-submit")   # An endpoint to submit the user's answers for the MCQ questions in a specific attempt. It first retrieves the attempt document using the _attempt_or_404 helper function to ensure that it exists and belongs to the user. It then checks if the attempt is currently in the "mcq_in_progress" status, and if not, it raises a 409 Conflict error indicating that the MCQ stage is not active. It validates that there are MCQ questions in the attempt and that the user has provided answers for all questions. It then evaluates the user's answers against the correct answers from the MCQ dataset, calculates the score, and updates the attempt document with the results, changing the status to "diagram_pending" to indicate that the user can now proceed to submit their diagram answers. Finally, it returns the updated attempt data in the response.
def mcq_submit(attempt_id: str, body: McqSubmitIn, user=Depends(get_current_user)):
    doc = _attempt_or_404(attempt_id, user["id"])
    if doc.get("status") != "mcq_in_progress":
        raise HTTPException(status_code=409, detail="MCQ stage is not active")

    questions = doc.get("mcq_questions", [])  # Retrieve the list of MCQ questions from the attempt document. If there are no questions, it raises a 400 Bad Request error indicating that there are no MCQ questions in the attempt. This ensures that the endpoint has the necessary data to evaluate the submitted answers and prevents processing an attempt that is not properly set up with MCQ questions.
    if not questions:
        raise HTTPException(status_code=400, detail="No MCQ questions in attempt")

    answers_map = {int(a.id): str(a.selected).strip() for a in body.answers}   # Create a mapping of question IDs to the user's selected answers from the submitted data. It converts the question IDs to integers and strips whitespace from the selected answers to ensure that they can be accurately compared against the correct answers from the MCQ dataset. This mapping is used in the evaluation step to determine which answer corresponds to which question.
    if any(not answers_map.get(int(q["id"])) for q in questions):
        raise HTTPException(status_code=400, detail="Answer all questions before saving")

    df = _mcq_df()   # Retrieve the MCQ dataset as a pandas DataFrame to access the correct answers for the questions in the attempt. It then filters the DataFrame to get only the rows corresponding to the question IDs in the attempt, creating a mapping of question IDs to their respective rows for easy lookup during answer evaluation. This allows the code to efficiently evaluate the user's answers against the correct answers for each question.
    rows = df[df["qid"].isin([int(q["id"]) for q in questions])]
    rows_by_qid = {int(r["qid"]): r for _, r in rows.iterrows()}

    results = []  # Initialize an empty list to store the results of evaluating each question. It then iterates over the questions in the attempt, retrieves the corresponding row from the MCQ dataset using the question ID, and compares the user's selected answer against the correct answer. For each question, it appends a result dictionary to the results list containing the question ID, question text, selected answer, correct answer, and whether the user's answer is correct. It also keeps track of the total score by counting how many questions were answered correctly. This results list is then stored in the attempt document for later reference when showing results to the user.
    score = 0
    for q in questions:
        qid = int(q["id"])
        row = rows_by_qid.get(qid)
        if row is None:
            continue
        selected = answers_map[qid]   # Get the user's selected answer for the current question ID from the answers_map. This is the answer that the user submitted for this question, and it will be compared against the correct answer from the MCQ dataset to determine if it is correct.
        correct_answer = str(row[_STATE["correct_col"]]).strip()
        is_correct = selected == correct_answer
        if is_correct:
            score += 1
        results.append({
            "id": qid,
            "question": q["question"],
            "selected": selected,
            "correct_answer": correct_answer,
            "is_correct": bool(is_correct),
        })

    if len(results) != len(questions):  # If the number of results does not match the number of questions, it means that there was an issue evaluating the answers (e.g., a question ID from the attempt did not match any question in the MCQ dataset). In this case, it raises an HTTPException with a 500 status code indicating that it could not evaluate all answers. This is a safeguard to ensure that the evaluation process was able to properly assess each question and that there are no discrepancies in the data.
        raise HTTPException(status_code=500, detail="Could not evaluate all answers")

    now = _now()  # Get the current datetime to update the attempt document's updated_at timestamp and to set the mcq_submitted_at timestamp. This ensures that the attempt has accurate timestamps for when the MCQ answers were submitted and when the attempt was last updated, which is important for tracking the user's progress and for sorting attempts when retrieving them from the database.
    _attempts_col().update_one(
        {"_id": doc["_id"]},
        {"$set": {
            "status": "diagram_pending",
            "updated_at": now,
            "mcq_answers": [{"id": r["id"], "selected": r["selected"]} for r in results],
            "mcq_results": results,
            "mcq_score": score,
            "mcq_total": len(results),
            "mcq_submitted_at": now,
        }},
    )

    updated = _attempt_or_404(attempt_id, user["id"])   # After updating the attempt document with the MCQ results and changing the status to "diagram_pending", it retrieves the updated document using the _attempt_or_404 helper function to ensure that it reflects the latest changes. It then returns the serialized updated attempt in the response, allowing the frontend to show the user their MCQ results and indicate that they can now proceed to submit their diagram answers.
    return {"attempt": _serialize_attempt(updated)}


class _UploadShim:  # A helper class to create a file-like object from the uploaded image data for use in the diagram predictor. It takes the filename and content of the uploaded image and creates an in-memory byte stream that can be passed to the predictor's predict method. This allows the predictor to read the image data as if it were a file, which is necessary for processing the diagram images submitted by the user.
    def __init__(self, filename: str, content: bytes):
        self.filename = filename
        self.stream = io.BytesIO(content)


@router.post("/attempt/{attempt_id}/diagram-submit")  # An endpoint to submit the user's diagram images for a specific attempt. It retrieves the attempt document using the _attempt_or_404 helper function to ensure that it exists and belongs to the user. It checks if the attempt is currently in the "diagram_pending" status, and if not, it raises a 409 Conflict error indicating that the diagram stage is not active. It validates that there are assigned diagram questions in the attempt and that the user has uploaded images for all assigned diagram questions. It then iterates over the assigned diagram questions and corresponding uploaded images, using the initialized DiagramPredictor to evaluate each image against the expected answers for the assigned questions. The results of the predictions are collected into a list, which is then stored in the attempt document along with updating the status to "completed". Finally, it returns the updated attempt data in the response, allowing the frontend to show the user their results for both MCQ and diagram stages.
async def diagram_submit(
    attempt_id: str,
    images: List[UploadFile] = File(...),
    user=Depends(get_current_user),
):
    doc = _attempt_or_404(attempt_id, user["id"])  # Retrieve the attempt document by ID and user ID to ensure it exists and belongs to the current user. This is necessary to access the details of the attempt, such as the assigned diagram questions and to update the attempt with the results of the diagram submission.
    if doc.get("status") != "diagram_pending":
        raise HTTPException(status_code=409, detail="Diagram stage is not active")

    questions = doc.get("diagram_questions")  # Retrieve the list of assigned diagram questions from the attempt document. If there are no diagram questions, it checks for the old "diagram_question" field and wraps it in a list if it exists. If there are still no questions after this check, it raises a 400 Bad Request error indicating that there are no diagram questions in the attempt. This ensures that the endpoint has the necessary data to evaluate the submitted images and prevents processing an attempt that is not properly set up with diagram questions.
    if not questions:
        single_q = doc.get("diagram_question")
        questions = [single_q] if single_q else []
    if not questions:
        raise HTTPException(status_code=400, detail="No diagram questions in attempt")

    if not images or len(images) < len(questions):
        raise HTTPException(status_code=400, detail=f"Please upload {len(questions)} diagram images")

    now = _now()  # Get the current datetime to update the attempt document's updated_at timestamp and to set the completed_at timestamp when marking the attempt as completed. This ensures that the attempt has accurate timestamps for when the diagram answers were submitted and when the attempt was completed, which is important for tracking the user's progress and for sorting attempts when retrieving them from the database.
    diagram_results = []
    predictor = _predictor()

    for idx, q in enumerate(questions):  # Iterate over the assigned diagram questions and the corresponding uploaded images. For each question, it retrieves the uploaded image at the same index and checks if it exists and has a filename. If not, it raises a 400 Bad Request error indicating that the image for that question is required. It then reads the content of the uploaded image and checks if it is not empty, raising a 400 error if the uploaded image is empty. It parses the question number from the assigned question and uses the predictor to evaluate the uploaded image against the expected answers for that question. If the prediction fails or returns an unsuccessful result, it raises an appropriate HTTPException with details about the failure. If the prediction is successful, it collects the results into a dictionary and appends it to the diagram_results list, which will later be stored in the attempt document.
        image = images[idx]
        if not image or not image.filename:
            raise HTTPException(status_code=400, detail=f"Image {idx + 1} is required")

        data = await image.read()  # Read the content of the uploaded image file asynchronously. This allows the server to handle the file upload without blocking other operations. After reading the data, it checks if the data is not empty, and if it is empty, it raises a 400 Bad Request error indicating that the uploaded image is empty. This ensures that the endpoint receives valid image data for processing and prevents attempts to evaluate an empty file as a diagram.
        if not data:
            raise HTTPException(status_code=400, detail=f"Uploaded image {idx + 1} is empty")

        question_no = _parse_question_no(q.get("question_no"))  # Parse the question number from the assigned diagram question using the _parse_question_no helper function. If the question number cannot be parsed and is None, it raises a 400 Bad Request error indicating that the question number is invalid for that diagram. This ensures that the predictor receives a valid question number to evaluate the uploaded image against the correct expected answers for that specific diagram question.
        if question_no is None:
            raise HTTPException(status_code=400, detail=f"Invalid question_no for diagram {idx + 1}")
        try:
            pred = predictor.predict(_UploadShim(image.filename, data), question_no)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Diagram prediction failed for question {question_no}: {str(e)}",
            )
        if not pred.get("success"):   # If the prediction result does not indicate success, it raises an HTTPException with a 400 status code and includes any error message provided in the prediction result. This allows the API to communicate specific issues that occurred during the prediction process, such as if the uploaded image could not be processed or if the prediction did not meet certain criteria for success.
            raise HTTPException(status_code=400, detail=pred.get("error", "Prediction failed"))

        pred_qno = _parse_question_no(pred.get("question_no"))   # After receiving the prediction result, it attempts to parse the question number from the prediction result using the _parse_question_no helper function. If the parsed question number is None, it falls back to using the original question number from the assigned diagram question. This ensures that there is a valid question number associated with the prediction result, which is important for storing the results in the attempt document and for referencing which question the results correspond to.
        if pred_qno is None:
            pred_qno = question_no

        diagram_results.append({    # It collects the relevant information from the prediction result into a structured dictionary and appends it to the diagram_results list. This includes whether the prediction was successful, the question number, question code, question text, whether the predicted answer is correct, the confidence of the prediction, any identified issues with the diagram, and descriptions of those issues. This structured result will be stored in the attempt document to provide detailed feedback to the user about their diagram submission.
            "success": True,
            "question_no": pred_qno,
            "question_code": pred.get("question_code"),
            "question_text": pred.get("question_text"),
            "pred_correct": bool(pred.get("pred_correct")),
            "correct_probability": pred.get("correct_probability"),
            "pred_issue_text": pred.get("pred_issue_text"),
            "pred_issue_confidence": pred.get("pred_issue_confidence"),
            "issue_description": pred.get("issue_description") or "",
            "expected_correction": pred.get("expected_correction") or "",
            "filename": image.filename,
            "submitted_at": now.isoformat(),
        })

    _attempts_col().update_one(    # After processing all the diagram questions and collecting the results, it updates the attempt document in the database to set the status to "completed", update the updated_at timestamp, set the completed_at timestamp, and store the diagram results. It also sets the diagram_result field to the first result in the diagram_results list for backward compatibility with older documents that may only have a single diagram question. This update marks the attempt as completed and saves all relevant results for both MCQ and diagram stages.
        {"_id": doc["_id"]},
        {"$set": {
            "status": "completed",
            "updated_at": now,
            "completed_at": now,
            "diagram_result": diagram_results[0] if diagram_results else None,
            "diagram_results": diagram_results,
        }},
    )

    updated = _attempt_or_404(attempt_id, user["id"])    # After updating the attempt document to mark it as completed and store the diagram results, it retrieves the updated document using the _attempt_or_404 helper function to ensure that it reflects the latest changes. It then returns the serialized updated attempt in the response, allowing the frontend to show the user their results for both MCQ and diagram stages, along with the completed status of the attempt.
    return {"attempt": _serialize_attempt(updated)}              # The endpoint returns the updated attempt data in the response, allowing the frontend to display the results of the diagram submission along with the overall attempt details. This provides feedback to the user about their performance on both the MCQ and diagram sections of the assignment.
