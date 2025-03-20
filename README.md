# Camera Gesture Drawing

A web application that uses hand gesture recognition to create drawings with your webcam. Control brush size by moving your hand closer or further from the camera.

## Features

- Draw with your index finger: Point with just your index finger to draw
- Erase with open palm: Show an open hand to erase with a palm-sized eraser
- Select tools with peace sign: Make a peace sign and hold to enter selection mode
- Dynamic sizing: Move your hand closer to the camera for larger drawing/erasing, or further for smaller, more precise control

## Gestures

- **Drawing**: Point with index finger (other fingers curled)
- **Erasing**: Open palm (all fingers extended) 
- **Selection**: Peace sign (index and middle fingers extended)

## Tools

- Draw tool (different colors)
- Eraser tool
- Clear canvas
- Brush size options

## Technologies Used

- TensorFlow.js for hand tracking
- Handpose model for gesture recognition
- HTML5 Canvas for drawing
- Pure JavaScript without additional libraries

## Setup

1. Clone this repository
2. Open `index.html` in a modern web browser
3. Allow camera access when prompted
4. Show your hand to the camera and start drawing!

## Browser Compatibility

Works best in Chrome, Edge, and Firefox. Safari may have limited functionality with the camera API.
