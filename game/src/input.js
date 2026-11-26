// Meridian Run — keyboard and mouse input.
// One clear job: turn keys and the pointer into one control object per frame:
// pitch -1..1, roll -1..1, throttle 0..1, plus edge-triggered actions.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseX = 0; // -1..1 across the canvas
    this.mouseY = 0; // -1..1 down the canvas
    this.mouseActive = false;
    this.mouseSeen = false;
    this.pressed = new Set(); // keys pressed since last poll, edge-triggered
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouseY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      this.mouseActive = true;
      this.mouseSeen = true;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.pressed.add('MouseClick');
    });
  }

  // Consume edge-triggered presses (Enter, R, C, M, P, click).
  takePressed(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  endFrame() {
    this.pressed.clear();
  }

  // Analogue controls for this frame. The mouse steers when it has moved
  // recently; the keyboard always works and overrides the mouse on its axis.
  readControls(currentThrottle, dt) {
    let pitch = 0;
    let roll = 0;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) pitch += 1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) pitch -= 1;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) roll -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) roll += 1;
    if (this.mouseActive && this.mouseSeen) {
      if (roll === 0) roll = Math.max(-1, Math.min(1, this.mouseX * 1.4));
      if (pitch === 0) pitch = Math.max(-1, Math.min(1, -this.mouseY * 1.2));
    }
    let throttle = currentThrottle;
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) throttle = Math.min(1, throttle + dt * 0.9);
    if (this.keys.has('ControlLeft') || this.keys.has('ControlRight')) throttle = Math.max(0, throttle - dt * 0.9);
    if (this.keys.has('Digit1')) throttle = 0;
    if (this.keys.has('Digit2')) throttle = 0.5;
    if (this.keys.has('Digit3')) throttle = 1;
    return { pitch, roll, throttle };
  }
}
