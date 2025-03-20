const videoElement = document.getElementById('webcam');
const outputCanvas = document.getElementById('output-canvas');
const drawingCanvas = document.getElementById('drawing-canvas');
const statusMessage = document.getElementById('status-message');

const drawTool = document.getElementById('draw-tool');
const eraseTool = document.getElementById('erase-tool');
const clearTool = document.getElementById('clear-tool');

const smallSize = document.getElementById('small-size');
const mediumSize = document.getElementById('medium-size');
const largeSize = document.getElementById('large-size');

const colorOptions = document.querySelectorAll('.color-option');

// Drawing settings
let isDrawing = false;
let currentTool = 'draw';
let currentColor = '#ff0000';
let currentSize = 10;
let lastX = 0;
let lastY = 0;

// Selection mode
let isInSelectionMode = false;

// Canvas contexts
let outputCtx;
let drawingCtx;

// Hand tracking model
let handposeModel;

// Current gesture state
let currentGesture = 'none'; // 'none', 'point', 'peace', 'open'
let gestureStartTime = 0;
let gestureConfidence = 0;

// Distance tracking (for size calculation)
let handDistance = 0; // Z coordinate - approximate depth
const MIN_DEPTH = -40;
const MAX_DEPTH = 40;
const MIN_SIZE = 5;
const MAX_SIZE = 40;

// Start the webcam
async function setupCamera() {
    statusMessage.textContent = 'Starting camera...';
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });
        
        videoElement.srcObject = stream;
        
        return new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                resolve(videoElement);
            };
        });
    } catch (error) {
        console.error('Error accessing camera:', error);
        statusMessage.textContent = 'Camera error: ' + error.message;
        throw error;
    }
}

// Set up the canvases
function setupCanvases() {
    // Set the sizes of the canvases to match the video
    const width = videoElement.videoWidth;
    const height = videoElement.videoHeight;
    
    outputCanvas.width = width;
    outputCanvas.height = height;
    outputCtx = outputCanvas.getContext('2d');
    
    drawingCanvas.width = width;
    drawingCanvas.height = height;
    drawingCtx = drawingCanvas.getContext('2d');
    drawingCtx.lineCap = 'round';
    drawingCtx.lineJoin = 'round';
    
    // Mirror canvases to match camera
    outputCtx.translate(width, 0);
    outputCtx.scale(-1, 1);
    
    drawingCtx.translate(width, 0);
    drawingCtx.scale(-1, 1);
}

// Load the handpose model
async function loadHandposeModel() {
    statusMessage.textContent = 'Loading hand tracking model...';
    try {
        handposeModel = await handpose.load();
        statusMessage.textContent = 'Model loaded. Show your hand!';
        return handposeModel;
    } catch (error) {
        console.error('Error loading handpose model:', error);
        statusMessage.textContent = 'Error loading model: ' + error.message;
        throw error;
    }
}

// Calculate the dynamic size based on Z distance and palm size
function calculateDynamicSize(zDepth, palmSize) {
    // Normalize z depth to a 0-1 range (inverted so closer is larger)
    const normalizedDepth = 1.0 - ((zDepth - MIN_DEPTH) / (MAX_DEPTH - MIN_DEPTH));
    const clampedDepth = Math.min(Math.max(normalizedDepth, 0), 1);
    
    // Base the size on both palm size and distance
    const basePalmSize = palmSize * 0.4; // Scale down the palm size for drawing
    
    // Dynamic size based on palm size and depth
    const dynamicSize = basePalmSize * (0.5 + clampedDepth * 1.5); // Scale factor for depth
    
    return Math.max(dynamicSize, MIN_SIZE); // Ensure minimum size
}

// Draw keypoints and connections of the hand
function drawHand(predictions) {
    if (!predictions || predictions.length === 0) return;
    
    // Clear the output canvas
    outputCtx.save();
    outputCtx.setTransform(1, 0, 0, 1, 0, 0);
    outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
    outputCtx.restore();
    
    // Draw video frame
    outputCtx.drawImage(
        videoElement, 
        0, 0, 
        videoElement.videoWidth, 
        videoElement.videoHeight
    );
    
    // Draw each hand
    predictions.forEach(hand => {
        // Draw keypoints
        const keypoints = hand.landmarks;
        
        // Calculate palm properties
        const palmCenter = calculatePalmCenter(keypoints);
        const palmRadius = calculatePalmRadius(keypoints);
        
        // Draw points
        for (let i = 0; i < keypoints.length; i++) {
            const [x, y, z] = keypoints[i];
            
            // Start with a circle for each keypoint
            outputCtx.beginPath();
            outputCtx.arc(x, y, 3, 0, 2 * Math.PI);
            outputCtx.fillStyle = '#FF0000';
            outputCtx.fill();
        }
        
        // Draw connections (simplified version)
        // Connections for fingers
        const fingerIndices = [
            [0, 1, 2, 3, 4],           // Thumb
            [0, 5, 6, 7, 8],           // Index
            [0, 9, 10, 11, 12],        // Middle
            [0, 13, 14, 15, 16],       // Ring
            [0, 17, 18, 19, 20]        // Pinky
        ];
        
        // Draw each finger
        fingerIndices.forEach(finger => {
            for (let i = 0; i < finger.length - 1; i++) {
                const [x1, y1] = keypoints[finger[i]];
                const [x2, y2] = keypoints[finger[i + 1]];
                
                outputCtx.beginPath();
                outputCtx.moveTo(x1, y1);
                outputCtx.lineTo(x2, y2);
                outputCtx.strokeStyle = '#00FF00';
                outputCtx.lineWidth = 2;
                outputCtx.stroke();
            }
        });

        // Draw gesture-specific visual feedback
        if (currentGesture === 'open') {
            // Draw a filled circle around the palm for erasing - full palm size
            outputCtx.beginPath();
            outputCtx.arc(palmCenter.x, palmCenter.y, palmRadius * 1.5, 0, 2 * Math.PI);
            outputCtx.fillStyle = 'rgba(255, 0, 0, 0.3)'; // semi-transparent red
            outputCtx.fill();
            outputCtx.strokeStyle = '#FF0000';
            outputCtx.lineWidth = 2;
            outputCtx.stroke();
        } else if (currentGesture === 'peace' && isInSelectionMode) {
            // Draw a selection indicator
            const indexFingertip = keypoints[8];
            
            outputCtx.beginPath();
            outputCtx.arc(indexFingertip[0], indexFingertip[1], 15, 0, 2 * Math.PI);
            outputCtx.strokeStyle = '#FFFF00';
            outputCtx.lineWidth = 3;
            outputCtx.stroke();
            
            // Map hand position to UI
            const screenPos = mapHandToScreen(indexFingertip[0], indexFingertip[1]);
            
            // Draw indicator line to UI
            outputCtx.save();
            outputCtx.setTransform(1, 0, 0, 1, 0, 0);
            
            outputCtx.beginPath();
            outputCtx.moveTo(outputCanvas.width, indexFingertip[1]);
            outputCtx.lineTo(outputCanvas.width + 50, screenPos.y);
            outputCtx.strokeStyle = '#FFFF00';
            outputCtx.lineWidth = 2;
            outputCtx.stroke();
            
            outputCtx.restore();
        }
    });
    
    // Draw selection mode indicator
    if (isInSelectionMode) {
        outputCtx.save();
        outputCtx.setTransform(1, 0, 0, 1, 0, 0);
        outputCtx.fillStyle = 'rgba(255, 255, 0, 0.3)';
        outputCtx.fillRect(0, 0, outputCanvas.width, 10);
        outputCtx.restore();
    }
}

// Calculate the palm center from landmarks
function calculatePalmCenter(landmarks) {
    // Use the center of wrist and palm base points
    const wrist = landmarks[0];
    
    // Average of index, middle, ring and pinky MCP joints (finger bases)
    const indexMCP = landmarks[5];
    const middleMCP = landmarks[9];
    const ringMCP = landmarks[13];
    const pinkyMCP = landmarks[17];
    
    const x = (wrist[0] + indexMCP[0] + middleMCP[0] + ringMCP[0] + pinkyMCP[0]) / 5;
    const y = (wrist[1] + indexMCP[1] + middleMCP[1] + ringMCP[1] + pinkyMCP[1]) / 5;
    const z = (wrist[2] + indexMCP[2] + middleMCP[2] + ringMCP[2] + pinkyMCP[2]) / 5;
    
    return { x, y, z };
}

// Calculate palm radius based on landmarks (just palm, not including fingers)
function calculatePalmRadius(landmarks) {
    const palmCenter = calculatePalmCenter(landmarks);
    
    // Calculate maximum distance from palm center to wrist and MCP joints
    const wrist = landmarks[0];
    const indexMCP = landmarks[5];
    const pinkyMCP = landmarks[17];
    
    // Calculate distances
    const wristDist = distance(palmCenter, { x: wrist[0], y: wrist[1] });
    const indexDist = distance(palmCenter, { x: indexMCP[0], y: indexMCP[1] });
    const pinkyDist = distance(palmCenter, { x: pinkyMCP[0], y: pinkyMCP[1] });
    
    // Use maximum distance as palm radius
    return Math.max(wristDist, indexDist, pinkyDist);
}

// Helper function to calculate distance between two points
function distance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

// Process hand prediction results
function processHand(predictions) {
    if (!predictions || predictions.length === 0) {
        isDrawing = false;
        statusMessage.textContent = 'No hand detected';
        currentGesture = 'none';
        return;
    }
    
    // Get the first detected hand
    const hand = predictions[0];
    const keypoints = hand.landmarks;
    
    // Get fingertip and hand positions
    const indexFingertip = keypoints[8];
    const middleFingertip = keypoints[12];
    const ringFingertip = keypoints[16];
    const pinkyFingertip = keypoints[20];
    const indexMCP = keypoints[5];  // Index finger base
    const middleMCP = keypoints[9]; // Middle finger base
    const ringMCP = keypoints[13];  // Ring finger base
    const pinkyMCP = keypoints[17]; // Pinky base
    
    // Convert to canvas coordinates
    const x = indexFingertip[0];
    const y = indexFingertip[1];
    
    // Get palm position and size for erasing
    const palmPosition = calculatePalmCenter(keypoints);
    const palmRadius = calculatePalmRadius(keypoints);
    
    // Calculate hand depth (z coordinate) for dynamic sizing
    handDistance = indexFingertip[2];
    
    // Detect gestures
    
    // Check if index finger is extended
    const indexExtended = indexFingertip[1] < indexMCP[1] - 30;
    
    // Check if other fingers are extended
    const middleExtended = middleFingertip[1] < middleMCP[1] - 30;
    const ringExtended = ringFingertip[1] < ringMCP[1] - 30;
    const pinkyExtended = pinkyFingertip[1] < pinkyMCP[1] - 30;
    
    // Check distance between index and middle fingertips
    const distanceIndexMiddle = Math.sqrt(
        Math.pow(indexFingertip[0] - middleFingertip[0], 2) +
        Math.pow(indexFingertip[1] - middleFingertip[1], 2)
    );
    
    // Determine gesture type
    const isPeaceSign = indexExtended && middleExtended && !ringExtended && !pinkyExtended && distanceIndexMiddle < 100;
    const isPointingGesture = indexExtended && !middleExtended && !ringExtended && !pinkyExtended;
    const isOpenPalm = indexExtended && middleExtended && ringExtended && pinkyExtended;
    
    // Update gesture state with timing
    const now = Date.now();
    let newGesture = 'none';
    
    if (isPeaceSign) {
        newGesture = 'peace';
    } else if (isPointingGesture) {
        newGesture = 'point';
    } else if (isOpenPalm) {
        newGesture = 'open';
    }
    
    // If gesture changed, reset timer
    if (newGesture !== currentGesture) {
        currentGesture = newGesture;
        gestureStartTime = now;
        gestureConfidence = 0;
    } else {
        // Same gesture, increase confidence
        gestureConfidence = Math.min(1.0, (now - gestureStartTime) / 500);
    }
    
    // Calculate the dynamic size based on palm size and depth
    const dynamicBrushSize = calculateDynamicSize(handDistance, palmRadius);
    
    // Process gestures based on confidence
    if (currentGesture === 'peace' && gestureConfidence > 0.7) {
        // Peace sign - selection mode
        if (!isInSelectionMode) {
            enterSelectionMode();
        }
        
        // If we're already in selection mode, check for tool/color selection
        if (isInSelectionMode) {
            checkToolSelection(x, y);
        }
    } else if (currentGesture === 'point' && gestureConfidence > 0.3) {
        // Exit selection mode if we're in it
        if (isInSelectionMode) {
            exitSelectionMode();
        }
        
        // Pointing gesture for drawing
        statusMessage.textContent = 'Drawing Mode';
        
        // Draw with dynamic size based on depth and palm size
        drawStroke(x, y, dynamicBrushSize);
    } else if (currentGesture === 'open' && gestureConfidence > 0.4) {
        // Exit selection mode if we're in it
        if (isInSelectionMode) {
            exitSelectionMode();
        }
        
        // Open palm for erasing - use larger palm size
        statusMessage.textContent = 'Erasing Mode';
        eraseWithPalm(palmPosition.x, palmPosition.y, palmRadius * 1.5);
    } else if (currentGesture === 'none') {
        // No recognized gesture
        if (isInSelectionMode) {
            statusMessage.textContent = 'Selection Mode: Make peace sign to select';
        } else {
            statusMessage.textContent = 'Hand detected';
            isDrawing = false;
        }
    }
    
    // Update last position
    lastX = x;
    lastY = y;
}

// Enter selection mode
function enterSelectionMode() {
    isInSelectionMode = true;
    isDrawing = false;
    statusMessage.textContent = 'Selection Mode: Use peace sign to select';
}

// Exit selection mode
function exitSelectionMode() {
    isInSelectionMode = false;
    statusMessage.textContent = 'Exiting Selection Mode';
}

// Map hand coordinates to screen/UI coordinates
function mapHandToScreen(x, y) {
    // Map Y position from video to control panel
    const panelRect = document.querySelector('.controls').getBoundingClientRect();
    const canvasRect = outputCanvas.getBoundingClientRect();
    
    // Calculate normalized Y position (0-1) in the video
    const normalizedY = y / outputCanvas.height;
    
    // Map to control panel Y coordinate
    const screenY = panelRect.top + (normalizedY * panelRect.height);
    
    // X is less important since we're selecting from a vertical panel
    const screenX = panelRect.left + (panelRect.width / 2);
    
    return { x: screenX, y: screenY };
}

// Check which tool or control the hand is pointing at
function checkToolSelection(x, y) {
    // Map hand position to screen position
    const screenPos = mapHandToScreen(x, y);
    
    // UI Elements to check (in order of top to bottom on the panel)
    const elements = [
        { element: drawTool, action: () => setActiveTool('draw'), name: 'Draw Tool' },
        { element: eraseTool, action: () => setActiveTool('erase'), name: 'Eraser Tool' },
        { element: clearTool, action: () => clearCanvas(), name: 'Clear Canvas' },
        { element: smallSize, action: () => setBrushSize('small'), name: 'Small Brush' },
        { element: mediumSize, action: () => setBrushSize('medium'), name: 'Medium Brush' },
        { element: largeSize, action: () => setBrushSize('large'), name: 'Large Brush' }
    ];
    
    // Add color options
    colorOptions.forEach(option => {
        elements.push({
            element: option,
            action: () => setColor(option.dataset.color),
            name: `Color: ${option.dataset.color}`
        });
    });
    
    // Find closest element vertically
    let closestElement = null;
    let minDistance = Infinity;
    
    elements.forEach(item => {
        const rect = item.element.getBoundingClientRect();
        const centerY = rect.top + (rect.height / 2);
        const distance = Math.abs(screenPos.y - centerY);
        
        if (distance < minDistance) {
            minDistance = distance;
            closestElement = item;
        }
    });
    
    // Only select if within a reasonable distance
    if (closestElement && minDistance < 50) {
        // Highlight the element visually
        const prevBorder = closestElement.element.style.border;
        closestElement.element.style.border = '3px solid yellow';
        
        // Execute the action after a brief delay
        setTimeout(() => {
            closestElement.action();
            closestElement.element.style.border = prevBorder;
            
            // Show feedback
            statusMessage.textContent = `Selected: ${closestElement.name}`;
            
            // Exit selection mode after selection
            setTimeout(exitSelectionMode, 1000);
        }, 500);
    }
}

// Draw on the canvas with dynamic size
function drawStroke(x, y, size) {
    if (!drawingCtx) return;
    
    if (!isDrawing) {
        isDrawing = true;
        drawingCtx.beginPath();
        drawingCtx.moveTo(x, y);
    } else {
        drawingCtx.lineTo(x, y);
        drawingCtx.strokeStyle = currentColor;
        drawingCtx.lineWidth = size; // Use dynamic size
        drawingCtx.stroke();
    }
}

// Erase with palm
function eraseWithPalm(x, y, radius) {
    if (!drawingCtx) return;
    
    drawingCtx.globalCompositeOperation = 'destination-out';
    drawingCtx.beginPath();
    drawingCtx.arc(x, y, radius, 0, Math.PI * 2);
    drawingCtx.fill();
    drawingCtx.globalCompositeOperation = 'source-over';
}

// Clear the drawing canvas
function clearCanvas() {
    if (!drawingCtx) return;
    
    drawingCtx.save();
    drawingCtx.setTransform(1, 0, 0, 1, 0, 0);
    drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    drawingCtx.restore();
    
    // Restore transformation
    drawingCtx.translate(drawingCanvas.width, 0);
    drawingCtx.scale(-1, 1);
}

// Set up UI elements
function setupUI() {
    // Tool buttons
    drawTool.addEventListener('click', () => {
        setActiveTool('draw');
    });
    
    eraseTool.addEventListener('click', () => {
        setActiveTool('erase');
    });
    
    clearTool.addEventListener('click', () => {
        clearCanvas();
    });
    
    // Brush size buttons
    smallSize.addEventListener('click', () => {
        setBrushSize('small');
    });
    
    mediumSize.addEventListener('click', () => {
        setBrushSize('medium');
    });
    
    largeSize.addEventListener('click', () => {
        setBrushSize('large');
    });
    
    // Color options
    colorOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            setColor(e.target.dataset.color);
        });
    });
    
    // Keyboard shortcuts for testing
    document.addEventListener('keydown', (e) => {
        if (e.key === 's') enterSelectionMode();
        if (e.key === 'd') exitSelectionMode();
        if (e.key === 'c') clearCanvas();
    });
}

// Set active tool
function setActiveTool(tool) {
    currentTool = tool;
    
    // Update UI
    drawTool.classList.toggle('active', tool === 'draw');
    eraseTool.classList.toggle('active', tool === 'erase');
}

// Set brush size
function setBrushSize(size) {
    switch(size) {
        case 'small':
            currentSize = 5;
            break;
        case 'medium':
            currentSize = 10;
            break;
        case 'large':
            currentSize = 20;
            break;
    }
    
    // Update UI
    smallSize.classList.toggle('active', size === 'small');
    mediumSize.classList.toggle('active', size === 'medium');
    largeSize.classList.toggle('active', size === 'large');
}

// Set drawing color
function setColor(color) {
    currentColor = color;
    
    // Update UI
    colorOptions.forEach(option => {
        option.classList.toggle('active', option.dataset.color === color);
    });
}

// Main prediction loop
async function predictHands() {
    // Check if video and model are ready
    if (videoElement.readyState < 2 || !handposeModel) {
        requestAnimationFrame(predictHands);
        return;
    }
    
    // Get hand predictions
    try {
        const predictions = await handposeModel.estimateHands(videoElement);
        
        // Draw the hands
        drawHand(predictions);
        
        // Process the hand gestures
        processHand(predictions);
    } catch (error) {
        console.error('Error during hand prediction:', error);
    }
    
    // Continue the prediction loop
    requestAnimationFrame(predictHands);
}

// Start the application
async function startApp() {
    setupUI();
    
    // Start the camera
    await setupCamera();
    videoElement.play();
    
    // Set up the canvases
    setupCanvases();
    
    // Load the handpose model
    await loadHandposeModel();
    
    // Start the prediction loop
    predictHands();
}

// Initialize the app when the document is loaded
document.addEventListener('DOMContentLoaded', startApp);
