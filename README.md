# backyard-flyer

## Concept

Backyard Flyer is an educational app for learning fundamentals of implementation of quad-copter control.
It will provide to the user a mix of articles, exercises and live coding sandbox.

### Live coding sandbox 

User has four tabs for each layer of control code.
Layer 1: event driven code for controlling takeoff, flying waypoints, and landing.
Layer 2: translates commands with waypoints into values of AETR (Roll, Pitch, Throttle, Yaw) 
Layer 3: is a PID controller which reads simulated sensors and ensures AETR values.
Layer 4: physics model of the drone and sensors 

App has most of functionality in a library, so user code does basic gluing all pieces together.
User can re-implement any of these library components.

User presented with 3D scene displaying drone flight according to entered program.

Different parts of the implementation are spread across multiple files. This files structure is predetermined. Goal is not creating a full fledged IDE.

User has ability to keep different versions of the code. It is stored in browser localStorage.
Use can export any of code version as a zip file (JSZip) or user can import previously exported zip.

User has a study guide which guides user into full implementation of control code.
Each step of the guide results in a another version of code.