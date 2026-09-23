# ai-service/tests/test_vit_wall_segmenter.py
import numpy as np
from models.vit_wall_segmenter import ViTWallSegmenter

def test_heatmap_matches_input_size_and_is_a_probability_map():
    # Random (untrained) weights: checks the architecture wiring, not accuracy.
    gray = np.random.default_rng(0).integers(0, 255, size=(120, 90), dtype=np.uint8)
    heatmap = ViTWallSegmenter(checkpoint_path=None).predict_heatmap(gray)
    assert heatmap.shape == gray.shape
    assert heatmap.dtype == np.float32
    assert 0.0 <= heatmap.min() and heatmap.max() <= 1.0
