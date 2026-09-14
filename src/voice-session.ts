import WebSocket from 'ws';
import type { VoiceEvent } from './shared';

export class VoiceSession {
  private socket: WebSocket | null = null;
  private pendingAudio: Buffer[] = [];

  start(apiKey: string, sampleRate: number, emit: (event: VoiceEvent) => void) {
    this.stop();
    this.pendingAudio = [];
    emit({ type: 'connecting', text: 'Connecting microphone…' });

    const params = new URLSearchParams({
      sample_rate: String(sampleRate),
      speech_model: 'u3-rt-pro',
      format_turns: 'true',
    });
    const socket = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?${params}`, {
      headers: { Authorization: apiKey },
    });
    this.socket = socket;

    let failed = false;
    socket.on('open', () => {
      if (this.socket !== socket) return;
      for (const chunk of this.pendingAudio) socket.send(chunk);
      this.pendingAudio = [];
      emit({ type: 'listening', text: 'Listening…' });
    });
    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as {
          type?: string;
          transcript?: string;
          end_of_turn?: boolean;
        };
        if (message.type === 'Turn' && message.transcript) {
          emit({
            type: message.end_of_turn ? 'final' : 'partial',
            text: message.transcript,
          });
        }
      } catch {
        emit({ type: 'error', text: 'AssemblyAI returned an unreadable event' });
      }
    });
    socket.on('error', (error) => {
      if (this.socket !== socket) return;
      failed = true;
      emit({ type: 'error', text: `Voice connection failed: ${error.message}` });
    });
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.pendingAudio = [];
      if (!failed) emit({ type: 'stopped', text: 'Microphone stopped' });
    });
  }

  send(chunk: ArrayBuffer) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(Buffer.from(chunk));
    } else if (this.socket?.readyState === WebSocket.CONNECTING) {
      this.pendingAudio.push(Buffer.from(chunk));
      this.pendingAudio = this.pendingAudio.slice(-20);
    }
  }

  stop() {
    const socket = this.socket;
    if (!socket) return;
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'Terminate' }));
    else socket.close();
  }
}
