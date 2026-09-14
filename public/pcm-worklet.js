class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = [];
    this.chunkSize = Math.ceil(sampleRate * 0.05);
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let index = 0; index < channel.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, channel[index]));
      this.samples.push(sample < 0 ? sample * 0x8000 : sample * 0x7fff);
    }
    if (this.samples.length >= this.chunkSize) {
      const pcm = new Int16Array(this.samples.splice(0, this.chunkSize));
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}

registerProcessor('pcm-processor', PcmProcessor);
