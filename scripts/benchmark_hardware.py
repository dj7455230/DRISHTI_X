#!/usr/bin/env python3
"""
DRISHTI-X — Hardware & Throughput Benchmark Script
Benchmarks Apple Silicon M4 MPS vs CPU throughput for:
  1. EfficientNet-B0 (224x224) DR Classification
  2. U-Net (512x512) Lesion Segmentation
Measures forward+backward step latency, samples/sec, epoch time estimate, and memory footprint.
"""

import time
import psutil
import torch
import torch.nn as nn
from torchvision.models import efficientnet_b0
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ai.segmentation.unet import UNet

def benchmark_efficientnet():
    print("\n================ BENCHMARK: EfficientNet-B0 (Classification) ================")
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    print(f"Device: {device}")
    
    batch_size = 16
    img_size = 224
    num_classes = 5
    dataset_size = 2563  # APTOS train size
    
    model = efficientnet_b0(weights=None)
    model.classifier = nn.Sequential(nn.Dropout(0.3), nn.Linear(1280, num_classes))
    model = model.to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)
    criterion = nn.CrossEntropyLoss()
    
    # Warmup
    dummy_x = torch.randn(batch_size, 3, img_size, img_size, device=device)
    dummy_y = torch.randint(0, num_classes, (batch_size,), device=device)
    for _ in range(5):
        optimizer.zero_grad()
        out = model(dummy_x)
        loss = criterion(out, dummy_y)
        loss.backward()
        optimizer.step()
    if device.type == "mps":
        torch.mps.synchronize()
        
    # Timed run: 20 batches
    iters = 20
    t0 = time.time()
    for _ in range(iters):
        optimizer.zero_grad()
        out = model(dummy_x)
        loss = criterion(out, dummy_y)
        loss.backward()
        optimizer.step()
    if device.type == "mps":
        torch.mps.synchronize()
    total_time = time.time() - t0
    
    time_per_batch = total_time / iters
    samples_per_sec = (batch_size * iters) / total_time
    total_batches = int(np.ceil(dataset_size / batch_size)) if 'np' in globals() else (dataset_size + batch_size - 1) // batch_size
    estimated_epoch_sec = total_batches * time_per_batch
    
    print(f"Throughput: {samples_per_sec:.2f} images/sec")
    print(f"Time per batch ({batch_size} images): {time_per_batch*1000:.1f} ms")
    print(f"Total batches per epoch: {total_batches}")
    print(f"Estimated training time per epoch: {estimated_epoch_sec:.1f} seconds ({estimated_epoch_sec/60:.2f} min)")
    
    return {
        "device": str(device),
        "batch_size": batch_size,
        "samples_per_sec": samples_per_sec,
        "estimated_epoch_sec": estimated_epoch_sec
    }

def benchmark_unet():
    print("\n================ BENCHMARK: U-Net (Lesion Segmentation) ================")
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    print(f"Device: {device}")
    
    batch_size = 4
    img_size = 512
    num_classes = 4
    dataset_size = 54  # IDRiD train size
    
    model = UNet(in_channels=3, out_channels=num_classes).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-4)
    criterion = nn.CrossEntropyLoss()
    
    # Warmup
    dummy_x = torch.randn(batch_size, 3, img_size, img_size, device=device)
    dummy_y = torch.randint(0, num_classes, (batch_size, img_size, img_size), device=device)
    for _ in range(3):
        optimizer.zero_grad()
        out = model(dummy_x)
        loss = criterion(out, dummy_y)
        loss.backward()
        optimizer.step()
    if device.type == "mps":
        torch.mps.synchronize()
        
    # Timed run: 10 batches
    iters = 10
    t0 = time.time()
    for _ in range(iters):
        optimizer.zero_grad()
        out = model(dummy_x)
        loss = criterion(out, dummy_y)
        loss.backward()
        optimizer.step()
    if device.type == "mps":
        torch.mps.synchronize()
    total_time = time.time() - t0
    
    time_per_batch = total_time / iters
    samples_per_sec = (batch_size * iters) / total_time
    total_batches = (dataset_size + batch_size - 1) // batch_size
    estimated_epoch_sec = total_batches * time_per_batch
    
    print(f"Throughput: {samples_per_sec:.2f} images/sec")
    print(f"Time per batch ({batch_size} images): {time_per_batch*1000:.1f} ms")
    print(f"Total batches per epoch: {total_batches}")
    print(f"Estimated training time per epoch: {estimated_epoch_sec:.1f} seconds")
    
    return {
        "device": str(device),
        "batch_size": batch_size,
        "samples_per_sec": samples_per_sec,
        "estimated_epoch_sec": estimated_epoch_sec
    }

if __name__ == "__main__":
    eff_res = benchmark_efficientnet()
    unet_res = benchmark_unet()
    
    vm = psutil.virtual_memory()
    print("\n================ SYSTEM SUMMARY ================")
    print(f"RAM Total: {vm.total / (1024**3):.1f} GB | Available: {vm.available / (1024**3):.1f} GB")
    print(f"Recommended classification schedule: 8-10 epochs (~{eff_res['estimated_epoch_sec']*10/60:.1f} min)")
    print(f"Recommended segmentation schedule: 20-30 epochs (~{unet_res['estimated_epoch_sec']*25/60:.1f} min)")

