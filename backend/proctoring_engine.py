"""
Core proctoring engine with MediaPipe Face Mesh integration
Handles face detection, head pose estimation, and mouth movement detection
"""
import cv2
import numpy as np
import mediapipe as mp
import time
import logging
from typing import Optional, Tuple, Dict
from models import AlertType, AlertEvent, Severity, StatusUpdate

# Import YOLO for object detection (e.g. phones)
try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None

logger = logging.getLogger(__name__)
from config import (
    YAW_THRESHOLD,
    MAR_THRESHOLD,
    HEAD_TURN_DURATION,
    ALERT_COOLDOWN,
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
        self.mp_face_mesh = None
        self.face_mesh = None
        self.mediapipe_available = False
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
                logger.warning("MediaPipe FaceMesh API is unavailable in this environment; face proctoring disabled.")
        except Exception as e:
            logger.exception(f"Failed to initialize MediaPipe FaceMesh: {e}")
            self.face_mesh = None
            self.mediapipe_available = False
        
        # State tracking
        self.head_turn_start_time = None
        self.current_violation = None
        self.last_alert_time = 0
        self.last_alert_type = None
        
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
            timestamp=timestamp
        )
        
        alert = None
        
        # Priority 0: Object Detection for Cell Phones
        if self.yolo_model is not None:
            # YOLO processes BGR natively, so we pass frame directly
            yolo_results = self.yolo_model(frame, verbose=False, conf=0.25)
            phone_detected = False
            best_conf = 0.0
            for r in yolo_results:
                for box in r.boxes:
                    class_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    # COCO class 67 is 'cell phone'
                    if class_id == 67:
                        logger.debug(f"Cell phone detected with confidence {conf:.2f}")
                        if conf > best_conf:
                            best_conf = conf
                        if conf > 0.25:
                            phone_detected = True
                            break
                if phone_detected:
                    break

            if phone_detected:
                logger.info(f"PHONE_DETECTED alert — confidence {best_conf:.2f}")
                if current_time - self.last_alert_time >= ALERT_COOLDOWN:
                    alert = self._create_alert(AlertType.PHONE_DETECTED, current_time)
                    self._reset_timers()
                status.status = "violation_detected"
                return alert, status
        
        if results is None:
            # Keep stream alive even when FaceMesh is unavailable on this runtime.
            status.status = "monitoring_degraded"
            status.face_detected = False
            return alert, status

        if not results.multi_face_landmarks:
            # No face detected
            alert = self._create_alert(AlertType.NO_FACE, current_time)
            status.status = "no_face"
            self._reset_timers()
        else:
            # Face detected
            status.face_detected = True
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
