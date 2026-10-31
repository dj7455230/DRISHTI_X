#!/usr/bin/env python3
"""
DRISHTI-X — Canonical Retinal Lesion Segmentation Model Training Entrypoint
Wrapper around training.train_unet.
"""
from training.train_unet import train_unet

if __name__ == "__main__":
    train_unet()

