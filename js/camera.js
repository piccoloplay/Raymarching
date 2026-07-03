// ============================================================
//  camera.js
//  Camera orbitale (spherical coords) + gestione mouse.
//
//  - drag        -> ruota yaw/pitch attorno al target
//  - rotella     -> avvicina/allontana (raggio)
//  - Z up        -> coerente con la convenzione di OpenSCAD
//
//  Espone:
//    OrbitCamera(target, distance, yaw, pitch)
//      .position  -> Float32Array(3)
//      .target    -> Float32Array(3)
//      .update()  -> ricalcola .position dalle sferiche
//      .attach(canvas) -> registra i listener mouse/wheel
// ============================================================

function OrbitCamera(target, distance, yaw, pitch) {
    this.target   = new Float32Array(target || [0.0, 0.0, 0.0]);
    this.distance = (distance != null) ? distance : 14.0;
    this.yaw      = (yaw      != null) ? yaw      : 0.7;
    this.pitch    = (pitch    != null) ? pitch    : 0.25;

    this.minDist  = 4.0;
    this.maxDist  = 40.0;
    this.minPitch = -1.3;
    this.maxPitch = +1.3;

    this.position = new Float32Array(3);
    this.update();
}

// Ricalcola la posizione cartesiana dalla terna (yaw, pitch, dist).
// Convenzione Z-up (come OpenSCAD): pitch=0 sul piano XY.
OrbitCamera.prototype.update = function () {
    var cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    var cy = Math.cos(this.yaw),   sy = Math.sin(this.yaw);
    this.position[0] = this.target[0] + this.distance * cp * sy;
    this.position[1] = this.target[1] + this.distance * cp * cy;
    this.position[2] = this.target[2] + this.distance * sp;
};

// Registra i listener su una canvas per drag + zoom.
OrbitCamera.prototype.attach = function (canvas) {
    var self = this;
    var dragging = false, lastX = 0, lastY = 0;

    canvas.addEventListener('mousedown', function (e) {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
    });

    window.addEventListener('mouseup', function () {
        dragging = false;
    });

    window.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        var dx = e.clientX - lastX;
        var dy = e.clientY - lastY;
        self.yaw   -= dx * 0.005;
        self.pitch += dy * 0.005;
        self.pitch  = Math.max(self.minPitch,
                      Math.min(self.maxPitch, self.pitch));
        lastX = e.clientX;
        lastY = e.clientY;
        self.update();
    });

    canvas.addEventListener('wheel', function (e) {
        self.distance *= Math.exp(e.deltaY * 0.001);
        self.distance  = Math.max(self.minDist,
                         Math.min(self.maxDist, self.distance));
        self.update();
        e.preventDefault();
    }, { passive: false });
};
