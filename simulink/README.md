# DRISHTI-X — Simulink Telemedicine Simulation

## Status
SIMULINK NOT INSTALLED — Simulation model files are ready but require MATLAB + Simulink.

## Model: `rural_telemedicine_pipeline.slx`

### What it simulates
```
Image Acquisition → Compression → Network Channel → Bandwidth Constraint
      ↓                                                       ↓
 PHC Camera                                          Specialist Queue
                                                            ↓
                                               Review → Referral Decision
```

### Blocks
| Block | Description |
|-------|-------------|
| ImageAcquisition | Fundus camera capture simulation |
| CompressionStage | JPEG/HEIC compression at configurable quality |
| NetworkChannel | Variable bandwidth (2G/3G/4G/WiFi) |
| BandwidthLimiter | Rate limiter: 10kbps–10Mbps configurable |
| TransmissionQueue | Priority queue for cases |
| SpecialistReview | Processing time model (Erlang distribution) |
| ReferralDecision | Decision output |

### Scenarios
| Scenario | Bandwidth | Patients/Year |
|----------|-----------|--------------|
| Low (2G) | 64 kbps | ~12,000 |
| Medium (3G) | 1 Mbps | ~45,000 |
| High (4G/WiFi) | 10 Mbps | ~100,000+ |

### Output Metrics (SIMULATION RESULTS — not real-world)
- Patients served per year
- Average upload latency (ms)
- Queue length over time
- Specialist utilization %
- Cases reviewed vs missed

## To Run
1. Install MATLAB R2023a+ with Simulink
2. Open `rural_telemedicine_pipeline.slx`
3. Configure scenario parameters
4. Run simulation
5. Results export to `simulink/results/`

## Python Bridge
`simulink/simulink_runner.py` calls the simulation via MATLAB Engine
and returns metrics as JSON for the frontend dashboard.
