// The microphone's samples, off the audio thread in blocks of 2048 (about 43 ms at 48 kHz), mixed down to mono.

class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.block = new Float32Array(2048);
    this.filled = 0;
    this.stopped = false;
    this.port.onmessage = (event) => {
      if (event.data === "stop") this.stopped = true;
    };
  }

  process(inputs) {
    const channels = inputs[0];
    if (this.stopped) return false;
    if (!channels?.length) return true;
    const frames = channels[0].length;
    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (const channel of channels) sum += channel[i];
      this.block[this.filled++] = sum / channels.length;
      if (this.filled === this.block.length) {
        this.port.postMessage(this.block, [this.block.buffer]);
        this.block = new Float32Array(2048);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor("lx-capture", Capture);
