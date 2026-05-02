import { useState, useRef, useEffect } from 'react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';

const AttendanceCounter = () => {
    const [model, setModel] = useState(null);
    const [isModelLoading, setIsModelLoading] = useState(true);
    const [image, setImage] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [studentCount, setStudentCount] = useState(0);
    const [predictions, setPredictions] = useState([]);
    const [isDragging, setIsDragging] = useState(false);

    const canvasRef = useRef(null);
    const imageRef = useRef(null);
    const fileInputRef = useRef(null);

    // Load TensorFlow.js COCO-SSD model on component mount
    useEffect(() => {
        const loadModel = async () => {
            try {
                setIsModelLoading(true);
                const loadedModel = await cocoSsd.load();
                setModel(loadedModel);
                setIsModelLoading(false);
            } catch (error) {
                console.error('Error loading model:', error);
                setIsModelLoading(false);
            }
        };
        loadModel();
    }, []);

    // Handle image upload
    const handleImageUpload = (file) => {
        if (!file || !file.type.startsWith('image/')) {
            alert('Please upload a valid image file');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            setImage(e.target.result);
            setPredictions([]);
            setStudentCount(0);
        };
        reader.readAsDataURL(file);
    };

    // Handle drag and drop events
    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        handleImageUpload(file);
    };

    // Handle file input change
    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        handleImageUpload(file);
    };

    // Handle image load event - run detection after image is fully loaded
    const handleImageLoad = () => {
        if (model && imageRef.current) {
            detectObjects();
        }
    };

    // Detect objects in the image
    const detectObjects = async () => {
        if (!model || !imageRef.current) return;

        setIsProcessing(true);
        try {
            const predictions = await model.detect(imageRef.current);

            // Filter only "person" predictions
            const personPredictions = predictions.filter(
                prediction => prediction.class === 'person'
            );

            setPredictions(personPredictions);
            setStudentCount(personPredictions.length);

            // Draw bounding boxes
            drawBoundingBoxes(personPredictions);
        } catch (error) {
            console.error('Error detecting objects:', error);
        }
        setIsProcessing(false);
    };

    // Draw bounding boxes on canvas
    const drawBoundingBoxes = (predictions) => {
        const canvas = canvasRef.current;
        const img = imageRef.current;

        if (!canvas || !img) return;

        const ctx = canvas.getContext('2d');

        // Set canvas dimensions to match image
        canvas.width = img.width;
        canvas.height = img.height;

        // Draw the image
        ctx.drawImage(img, 0, 0);

        // Draw bounding boxes for each detected person
        predictions.forEach((prediction) => {
            const [x, y, width, height] = prediction.bbox;
            const score = (prediction.score * 100).toFixed(1);

            // Draw rectangle
            ctx.strokeStyle = '#3B82F6'; // Blue color
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, width, height);

            // Draw label background
            ctx.fillStyle = '#3B82F6';
            const label = `Person ${score}%`;
            ctx.font = 'bold 16px Inter, sans-serif';
            const textWidth = ctx.measureText(label).width;
            ctx.fillRect(x, y - 25, textWidth + 10, 25);

            // Draw label text
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(label, x + 5, y - 7);
        });
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 py-8 px-4">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-white flex items-center justify-center gap-3 mb-2">
                        <span className="text-5xl">🎯</span>
                        Smart Attendance Counter
                    </h1>
                    <p className="text-gray-300 text-lg">
                        AI-Powered Student Detection using TensorFlow.js
                    </p>
                </div>

                {/* Model Loading State */}
                {isModelLoading && (
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-6 mb-6 backdrop-blur-sm">
                        <div className="flex items-center justify-center gap-3">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400"></div>
                            <span className="text-blue-300 font-medium">
                                Loading AI Model... Please wait
                            </span>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Upload Section */}
                    <div className="space-y-6">
                        {/* Drag and Drop Area */}
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${isDragging
                                ? 'border-blue-500 bg-blue-500/10'
                                : 'border-gray-600 bg-gray-800/30 hover:border-blue-400'
                                } backdrop-blur-sm`}
                        >
                            <div className="flex flex-col items-center gap-4">
                                <div className="text-6xl">📸</div>
                                <div>
                                    <p className="text-xl font-semibold text-white mb-2">
                                        {isDragging ? 'Drop image here' : 'Drag & Drop Image'}
                                    </p>
                                    <p className="text-gray-400 mb-4">
                                        or click the button below
                                    </p>
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isModelLoading}
                                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all shadow-lg shadow-blue-500/30"
                                >
                                    Select Image
                                </button>
                            </div>
                        </div>

                        {/* Count Display */}
                        {image && !isProcessing && (
                            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-8 text-center shadow-xl shadow-blue-500/30">
                                <div className="text-6xl mb-3">👥</div>
                                <div className="text-5xl font-bold text-white mb-2">
                                    {studentCount}
                                </div>
                                <div className="text-blue-100 text-lg font-medium">
                                    {studentCount === 1 ? 'Student Detected' : 'Students Detected'}
                                </div>
                            </div>
                        )}

                        {/* Processing State */}
                        {isProcessing && (
                            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-8 text-center backdrop-blur-sm">
                                <div className="flex flex-col items-center gap-4">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-3 border-blue-400"></div>
                                    <span className="text-blue-300 font-medium text-lg">
                                        Processing Image...
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Preview Section */}
                    <div className="space-y-4">
                        {image ? (
                            <div className="bg-gray-800/30 rounded-xl p-4 backdrop-blur-sm border border-gray-700/50">
                                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                    <span>🖼️</span>
                                    Detection Preview
                                </h3>
                                <div className="relative rounded-lg overflow-hidden bg-gray-900">
                                    {/* Hidden image for detection */}
                                    <img
                                        ref={imageRef}
                                        src={image}
                                        alt="Upload preview"
                                        className="hidden"
                                        onLoad={handleImageLoad}
                                    />
                                    {/* Canvas for displaying image with bounding boxes */}
                                    <canvas
                                        ref={canvasRef}
                                        className="w-full h-auto"
                                    />
                                </div>
                                {predictions.length > 0 && (
                                    <div className="mt-4 space-y-2">
                                        <p className="text-sm text-gray-400">
                                            Detected {predictions.length} person(s) with confidence:
                                        </p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {predictions.map((pred, idx) => (
                                                <div
                                                    key={idx}
                                                    className="bg-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-300"
                                                >
                                                    Person {idx + 1}: {(pred.score * 100).toFixed(1)}%
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="bg-gray-800/30 rounded-xl p-12 backdrop-blur-sm border border-gray-700/50 text-center">
                                <div className="text-6xl mb-4 opacity-50">🖼️</div>
                                <p className="text-gray-400">
                                    Upload an image to see the detection preview
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Instructions */}
                <div className="mt-8 bg-gray-800/30 rounded-xl p-6 backdrop-blur-sm border border-gray-700/50">
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                        <span>ℹ️</span>
                        How It Works
                    </h3>
                    <ul className="space-y-2 text-gray-300">
                        <li className="flex items-start gap-2">
                            <span className="text-blue-400">•</span>
                            Upload a classroom photo using drag-and-drop or the file selector
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-blue-400">•</span>
                            The AI model automatically detects all people in the image
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-blue-400">•</span>
                            Blue bounding boxes highlight each detected student
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-blue-400">•</span>
                            The total count is displayed for quick attendance tracking
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default AttendanceCounter;
