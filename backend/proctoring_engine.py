"""
Core proctoring engine with MediaPipe Face Mesh integration
Handles face detection, head pose estimation, and mouth movement detection
"""
import cv2
import numpy as np
import mediapipe as mp
import time
import logging
import os
from typing import Optional, Tuple, Dict
from models import AlertType, AlertEvent, Severity, StatusUpdate

# Import YOLO for object detection (e.g. phones)
try:
    os.environ.setdefault(
        "YOLO_CONFIG_DIR",
        os.path.join(os.path.dirname(__file__), "data", "ultralytics")
    )
    from ultralytics import YOLO
    YOLO_IMPORT_ERROR = None
except Exception as e:
    YOLO = None
    YOLO_IMPORT_ERROR = e

logger = logging.getLogger(__name__)
_MEDIAPIPE_WARNING_SHOWN = False
from config import (
    YAW_THRESHOLD,
    MAR_THRESHOLD,
    HEAD_TURN_DURATION,
    ALERT_COOLDOWN,
    NO_FACE_GRACE_PERIOD,
    PHONE_ALERT_RESET_SECONDS,
    MIN_DETECTION_CONFIDENCE,
    MIN_TRACKING_CONFIDENCE,
    MAX_NUM_FACES,
    ALERT_MESSAGES
)
from datetime import datetime


class ProctoringEngine:
    """Main proctoring engine for analyzing video frames"""
    
    def __init__(self):
        """Initialize MediaPipe Face Mesh and state tracking"""
        global _MEDIAPIPE_WARNING_SHOWN
        self.mp_face_mesh = None
        self.face_mesh = None
        self.mediapipe_available = False
        self.face_cascades = [
            cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml"),
            cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_alt2.xml"),
            cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_profileface.xml"),
        ]
        try:
            # Older MediaPipe builds expose mp.solutions.*; some newer wheels do not.
            if hasattr(mp, "solutions") and hasattr(mp.solutions, "face_mesh"):
                self.mp_face_mesh = mp.solutions.face_mesh
                self.face_mesh = self.mp_face_mesh.FaceMesh(
                    max_num_faces=MAX_NUM_FACES,
                    refine_landmarks=True,
                    min_detection_confidence=MIN_DETECTION_CONFIDENCE,
                    min_tracking_confidence=MIN_TRACKING_CONFIDENCE,
                )
                self.mediapipe_available = True
            else:
                if not _MEDIAPIPE_WARNING_SHOWN:
                    logger.info("MediaPipe FaceMesh API is unavailable; face proctoring is running in degraded mode.")
                    _MEDIAPIPE_WARNING_SHOWN = True
        except Exception as e:
            logger.exception(f"Failed to initialize MediaPipe FaceMesh: {e}")
            self.face_mesh = None
            self.mediapipe_available = False
        
        # State tracking
        self.head_turn_start_time = None
        self.current_violation = None
        self.last_alert_time = 0
        self.last_alert_type = None
        self.no_face_start_time = None
        self.phone_present = False
        self.last_phone_seen_time = None
        
        # 3D model points for head pose estimation
        self.model_points = np.array([
            (0.0, 0.0, 0.0),             # Nose tip
            (0.0, -330.0, -65.0),        # Chin
            (-225.0, 170.0, -135.0),     # Left eye left corner
            (225.0, 170.0, -135.0),      # Right eye right corner
            (-150.0, -150.0, -125.0),    # Left Mouth corner
            (150.0, -150.0, -125.0)      # Right mouth corner
        ])
        
        # Load YOLO model for cell phone detection
        if YOLO is not None:
            try:
                self.yolo_model = YOLO("yolov8n.pt")
                logger.info("YOLOv8 model loaded successfully.")
            except Exception as e:
                logger.error(f"Failed to load YOLO model: {e}")
                self.yolo_model = None
        else:
            if YOLO_IMPORT_ERROR:
                logger.warning("YOLO mobile phone detection is disabled: %s", YOLO_IMPORT_ERROR)
            else:
                logger.warning("ultralytics is not installed; mobile phone detection is disabled.")
            self.yolo_model = None
        
    def process_frame(self, frame: np.ndarray) -> Tuple[Optional[AlertEvent], StatusUpdate]:
        """
        Process a single frame and return alerts and status
        
        Args:
            frame: BGR image from webcam
            
        Returns:
            Tuple of (AlertEvent or None, StatusUpdate)
        """
        current_time = time.time()
        timestamp = datetime.now().isoformat()
        
        # Convert to RGB for MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        height, width = frame.shape[:2]
        
        # Process with MediaPipe if available
        results = self.face_mesh.process(rgb_frame) if self.face_mesh is not None else None
        
        # Initialize status
        status = StatusUpdate(
            status="processing",
            face_detected=False,
            face_status="missing",
            timestamp=timestamp
        )

        alert = None

        # Priority 0: Object Detection for Cell Phones
        phone_detected, phone_conf = self._detect_phone(frame)
        if phone_detected:
            self.last_phone_seen_time = current_time
            if not self.phone_present and current_time - self.last_alert_time >= ALERT_COOLDOWN:
                logger.info("PHONE_DETECTED alert - confidence %.2f", phone_conf)
                alert = self._create_alert(AlertType.PHONE_DETECTED, current_time)
                self._reset_timers()
            self.phone_present = True
            status.status = "violation_detected"
            return alert, status
        elif self.last_phone_seen_time is not None:
            if current_time - self.last_phone_seen_time >= PHONE_ALERT_RESET_SECONDS:
                self.phone_present = False
                self.last_phone_seen_time = None
        
        if results is None:
            # Fallback for runtimes where MediaPipe FaceMesh is unavailable.
            face_status = self._detect_face_with_opencv(frame)
            status.face_status = face_status
            status.face_detected = face_status in {"centered", "partial"}
            if status.face_detected:
                status.status = "monitoring"
                self.no_face_start_time = None
                self._reset_timers()
                return alert, status

            if self.no_face_start_time is None:
                self.no_face_start_time = current_time
            missing_duration = current_time - self.no_face_start_time
            status.status = "monitoring" if missing_duration < NO_FACE_GRACE_PERIOD else "no_face"
            if missing_duration >= NO_FACE_GRACE_PERIOD and current_time - self.last_alert_time >= ALERT_COOLDOWN:
                alert = self._create_alert(AlertType.NO_FACE, current_time)
            return alert, status

        if not results.multi_face_landmarks:
            # No face detected
            status.face_status = "missing"
            if self.no_face_start_time is None:
                self.no_face_start_time = current_time
            missing_duration = current_time - self.no_face_start_time
            status.status = "monitoring" if missing_duration < NO_FACE_GRACE_PERIOD else "no_face"
            if missing_duration >= NO_FACE_GRACE_PERIOD and current_time - self.last_alert_time >= ALERT_COOLDOWN:
                alert = self._create_alert(AlertType.NO_FACE, current_time)
            self._reset_timers()
        else:
            # Face detected
            status.face_detected = True
            status.face_status = "centered"
            self.no_face_start_time = None
            face_landmarks = results.multi_face_landmarks[0]
            
            # Calculate head pose
            yaw_angle, pitch_angle, roll_angle = self._calculate_head_pose(
                face_landmarks, width, height
            )
            
            status.head_pose = {
                "yaw": round(yaw_angle, 2),
                "pitch": round(pitch_angle, 2),
                "roll": round(roll_angle, 2)
            }
            
            # Calculate mouth aspect ratio
            mar = self._calculate_mouth_aspect_ratio(face_landmarks)
            status.mouth_status = "open" if mar > MAR_THRESHOLD else "closed"
            
            # Check for violations
            alert = self._check_violations(yaw_angle, mar, current_time)
            
            if alert:
                status.status = "violation_detected"
            else:
                status.status = "monitoring"
        
        return alert, status

    def _detect_phone(self, frame: np.ndarray) -> Tuple[bool, float]:
        if self.yolo_model is None:
            return False, 0.0

        yolo_results = self.yolo_model(frame, verbose=False, conf=0.25)
        best_conf = 0.0
        for result in yolo_results:
            names = getattr(result, "names", None) or getattr(self.yolo_model, "names", {})
            for box in result.boxes:
                class_id = int(box.cls[0])
                conf = float(box.conf[0])
                class_name = str(names.get(class_id, "")).lower()
                is_phone = class_id == 67 or "cell phone" in class_name or class_name == "phone"
                if is_phone:
                    best_conf = max(best_conf, conf)
                    if conf >= 0.25:
                        return True, best_conf

        return False, best_conf

    def _detect_face_with_opencv(self, frame: np.ndarray) -> str:
        cascades = [cascade for cascade in self.face_cascades if not cascade.empty()]
        if not cascades:
            logger.warning("OpenCV face cascades failed to load.")
            return "missing"

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        normalized = cv2.equalizeHist(gray)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(normalized)

        candidate_images = [gray, normalized, enhanced]
        candidate_params = [
            {"scaleFactor": 1.05, "minNeighbors": 4, "minSize": (60, 60)},
            {"scaleFactor": 1.1, "minNeighbors": 5, "minSize": (80, 80)},
            {"scaleFactor": 1.15, "minNeighbors": 3, "minSize": (50, 50)},
        ]

        for image in candidate_images:
            for cascade in cascades:
                for params in candidate_params:
                    faces = cascade.detectMultiScale(image, **params)
                    for face in faces:
                        bbox_state = self._classify_face_bbox(face, frame.shape[1], frame.shape[0])
                        if bbox_state != "missing":
                            return bbox_state

        return "missing"

    def _classify_face_bbox(self, face: tuple, frame_width: int, frame_height: int) -> str:
        x, y, w, h = [int(v) for v in face]

        area_ratio = (w * h) / float(frame_width * frame_height)
        if area_ratio < 0.025:
            return "missing"

        center_x = x + (w / 2.0)
        center_y = y + (h / 2.0)
        edge_margin_x = frame_width * 0.08
        edge_margin_y = frame_height * 0.05
        clipped = (
            x < edge_margin_x or
            (x + w) > (frame_width - edge_margin_x) or
            y < edge_margin_y or
            (y + h) > (frame_height - edge_margin_y)
        )
        centered = (
            frame_width * 0.2 <= center_x <= frame_width * 0.8 and
            frame_height * 0.2 <= center_y <= frame_height * 0.82
        )

        if centered and not clipped:
            return "centered"
        if area_ratio >= 0.035:
            return "partial"
        return "missing"
    
    def _calculate_head_pose(
        self, 
        face_landmarks, 
        width: int, 
        height: int
    ) -> Tuple[float, float, float]:
        """
        Calculate head pose angles (Yaw, Pitch, Roll) using 3D landmarks
        
        Args:
            face_landmarks: MediaPipe face landmarks
            width: Frame width
            height: Frame height
            
        Returns:
            Tuple of (yaw, pitch, roll) in degrees
        """
        # Extract 2D image points from landmarks
        # MediaPipe Face Mesh landmark indices:
        # 1: Nose tip, 152: Chin, 33: Left eye left corner,
        # 263: Right eye right corner, 61: Left mouth corner, 291: Right mouth corner
        
        image_points = np.array([
            (face_landmarks.landmark[1].x * width, face_landmarks.landmark[1].y * height),      # Nose tip
            (face_landmarks.landmark[152].x * width, face_landmarks.landmark[152].y * height),  # Chin
            (face_landmarks.landmark[33].x * width, face_landmarks.landmark[33].y * height),    # Left eye
            (face_landmarks.landmark[263].x * width, face_landmarks.landmark[263].y * height),  # Right eye
            (face_landmarks.landmark[61].x * width, face_landmarks.landmark[61].y * height),    # Left mouth
            (face_landmarks.landmark[291].x * width, face_landmarks.landmark[291].y * height)   # Right mouth
        ], dtype="double")
        
        # Camera internals (approximate)
        focal_length = width
        center = (width / 2, height / 2)
        camera_matrix = np.array([
            [focal_length, 0, center[0]],
            [0, focal_length, center[1]],
            [0, 0, 1]
        ], dtype="double")
        
        # Assuming no lens distortion
        dist_coeffs = np.zeros((4, 1))
        
        # Solve PnP to get rotation vector
        success, rotation_vector, translation_vector = cv2.solvePnP(
            self.model_points,
            image_points,
            camera_matrix,
            dist_coeffs,
            flags=cv2.SOLVEPNP_ITERATIVE
        )
        
        # Convert rotation vector to rotation matrix
        rotation_matrix, _ = cv2.Rodrigues(rotation_vector)
        
        # Calculate Euler angles
        # Extract yaw, pitch, roll from rotation matrix
        sy = np.sqrt(rotation_matrix[0, 0] ** 2 + rotation_matrix[1, 0] ** 2)
        
        singular = sy < 1e-6
        
        if not singular:
            pitch = np.arctan2(rotation_matrix[2, 1], rotation_matrix[2, 2])
            yaw = np.arctan2(-rotation_matrix[2, 0], sy)
            roll = np.arctan2(rotation_matrix[1, 0], rotation_matrix[0, 0])
        else:
            pitch = np.arctan2(-rotation_matrix[1, 2], rotation_matrix[1, 1])
            yaw = np.arctan2(-rotation_matrix[2, 0], sy)
            roll = 0
        
        # Convert to degrees
        pitch = np.degrees(pitch)
        yaw = np.degrees(yaw)
        roll = np.degrees(roll)
        
        return yaw, pitch, roll
    
    def _calculate_mouth_aspect_ratio(self, face_landmarks) -> float:
        """
        Calculate Mouth Aspect Ratio (MAR) to detect talking
        
        Args:
            face_landmarks: MediaPipe face landmarks
            
        Returns:
            MAR value (higher = mouth more open)
        """
        # Mouth landmarks (inner lips)
        # Top lip: 13, 14
        # Bottom lip: 78, 308
        # Left mouth corner: 61
        # Right mouth corner: 291
        
        # Get coordinates
        def get_coord(idx):
            return np.array([
                face_landmarks.landmark[idx].x,
                face_landmarks.landmark[idx].y,
                face_landmarks.landmark[idx].z
            ])
        
        # Vertical distances
        top_lip = get_coord(13)
        bottom_lip = get_coord(14)
        vertical_1 = np.linalg.norm(top_lip - bottom_lip)
        
        top_lip_2 = get_coord(78)
        bottom_lip_2 = get_coord(308)
        vertical_2 = np.linalg.norm(top_lip_2 - bottom_lip_2)
        
        # Horizontal distance (mouth width)
        left_corner = get_coord(61)
        right_corner = get_coord(291)
        horizontal = np.linalg.norm(left_corner - right_corner)
        
        # Calculate MAR
        if horizontal == 0:
            return 0.0
        
        mar = (vertical_1 + vertical_2) / (2.0 * horizontal)
        
        return mar
    
    def _check_violations(
        self, 
        yaw_angle: float, 
        mar: float, 
        current_time: float
    ) -> Optional[AlertEvent]:
        """
        Check for violations and manage timers
        
        Args:
            yaw_angle: Head yaw angle in degrees
            mar: Mouth aspect ratio
            current_time: Current timestamp
            
        Returns:
            AlertEvent if violation detected, None otherwise
        """
        # Check cooldown period
        if current_time - self.last_alert_time < ALERT_COOLDOWN:
            return None
        
        # Priority 1: Check for talking (immediate alert)
        if mar > MAR_THRESHOLD:
            self._reset_timers()
            return self._create_alert(AlertType.TALKING, current_time)
        
        # Priority 2: Check for head turn (requires sustained duration)
        if yaw_angle < -YAW_THRESHOLD:
            # Turning left
            if self.current_violation != AlertType.HEAD_TURN_LEFT:
                # New violation started
                self.current_violation = AlertType.HEAD_TURN_LEFT
                self.head_turn_start_time = current_time
            else:
                # Existing violation, check duration
                duration = current_time - self.head_turn_start_time
                if duration >= HEAD_TURN_DURATION:
                    return self._create_alert(AlertType.HEAD_TURN_LEFT, current_time)
        
        elif yaw_angle > YAW_THRESHOLD:
            # Turning right
            if self.current_violation != AlertType.HEAD_TURN_RIGHT:
                # New violation started
                self.current_violation = AlertType.HEAD_TURN_RIGHT
                self.head_turn_start_time = current_time
            else:
                # Existing violation, check duration
                duration = current_time - self.head_turn_start_time
                if duration >= HEAD_TURN_DURATION:
                    return self._create_alert(AlertType.HEAD_TURN_RIGHT, current_time)
        
        else:
            # No violation, reset timers
            if self.current_violation is not None:
                self._reset_timers()
                # Optionally send ALL_CLEAR
                if self.last_alert_type != AlertType.ALL_CLEAR:
                    return self._create_alert(AlertType.ALL_CLEAR, current_time)
        
        return None
    
    def _create_alert(
        self, 
        alert_type: AlertType, 
        current_time: float
    ) -> AlertEvent:
        """
        Create an alert event
        
        Args:
            alert_type: Type of alert
            current_time: Current timestamp
            
        Returns:
            AlertEvent object
        """
        self.last_alert_time = current_time
        self.last_alert_type = alert_type
        
        # Determine severity
        if alert_type == AlertType.ALL_CLEAR:
            severity = Severity.INFO
        elif alert_type == AlertType.NO_FACE:
            severity = Severity.WARNING
        else:
            severity = Severity.CRITICAL
        
        messages = ALERT_MESSAGES[alert_type.value]
        
        return AlertEvent(
            alert_type=alert_type,
            message_en=messages["en"],
            message_si=messages["si"],
            timestamp=datetime.now().isoformat(),
            severity=severity,
            metadata={
                "triggered_at": current_time
            }
        )
    
    def _reset_timers(self):
        """Reset violation timers"""
        self.head_turn_start_time = None
        self.current_violation = None
    
    def cleanup(self):
        """Cleanup resources"""
        if self.face_mesh is not None:
            self.face_mesh.close()
