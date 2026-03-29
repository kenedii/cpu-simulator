# CPU Visualizer

An interactive, educational CPU visualizer supporting both a simplified subset of the x86 architecture and the 4-bit TD4 architecture.

## Architectures

### x86 (Intel)
The simulator implements a limited, simplified educational subset of the 8086/x86 instruction set. This allows users to write assembly code in Intel syntax and watch the electricity flow through the simulated CPU components. It features standard general-purpose registers (EAX, EBX, etc.), an ALU with flags (ZF, CF, SF, OF), stack operations, and simple simulated I/O interrupts.

### TD4 (4-bit)
The TD4 architecture implementation is designed to perfectly replicate the **MuseLab version 1.3 TD4 CPU kit**, which itself is based on the famous Japanese educational DIY CPU from **Kaoru Tonami's book *"How a CPU is made" (CPU no Tsukurikata)***. 
It features:
- Exactly 12 physical instructions (no HLT, just pure TTL logic).
- 4-bit architecture with 2 registers (A, B).
- A specialized ROM viewer generating the precise reversed 8-bit DIP switch configurations (Immediate + Opcode) used physically to program the kit.
- A configurable ROM size defaulting to 32 bytes (256 bits) to allow extended experimentation beyond the physical hardware's limits.

## How to Run

### Standard Local Frontend (Python)
You can run the frontend easily using any local web server. For example, with Python 3:

```bash
# From the project root
python -m http.server 8000
```
Then visit `http://127.0.0.1:8000` in your web browser.

### Docker
You can easily spin up the application using Docker, which wraps the visualizer in an Nginx web server container:

```bash
docker build -t cpu-visualizer .
docker run -d -p 8080:80 cpu-visualizer
```
Then visit `http://localhost:8080` in your web browser.
