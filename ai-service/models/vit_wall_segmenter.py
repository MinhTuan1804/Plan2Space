import numpy as np
import torch
import torch.nn.functional as F
from torch import nn
from torchvision.models import vit_b_16

INPUT_SIZE = 224
PATCH_GRID = INPUT_SIZE // 16
IMAGENET_MEAN = torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1)
IMAGENET_STD = torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1)


class ViTWallSegNet(nn.Module):
    """ViT-B/16 backbone with a per-patch linear head producing wall logits on a 14x14 grid.

    Built from torchvision (no network download); weights come only from a local checkpoint
    produced by fine-tuning on CubiCasa5K, since the AI network has no internet egress.
    """

    def __init__(self):
        super().__init__()
        self.backbone = vit_b_16(weights=None)
        self.head = nn.Linear(self.backbone.hidden_dim, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:   # x: [B,3,224,224] -> [B,1,14,14]
        tokens = self.backbone._process_input(x)
        cls = self.backbone.class_token.expand(x.shape[0], -1, -1)
        encoded = self.backbone.encoder(torch.cat([cls, tokens], dim=1))[:, 1:]
        logits = self.head(encoded)                                      # [B,196,1]
        return logits.transpose(1, 2).reshape(x.shape[0], 1, PATCH_GRID, PATCH_GRID)


class ViTWallSegmenter:
    """Binary wall-pixel segmentation; consumed as-is by vectorize.py."""

    def __init__(self, checkpoint_path: str | None = None):
        self.checkpoint_path = checkpoint_path
        self._model: ViTWallSegNet | None = None

    def _lazy_load(self) -> ViTWallSegNet:
        if self._model is None:
            model = ViTWallSegNet()
            if self.checkpoint_path:
                model.load_state_dict(torch.load(self.checkpoint_path, map_location="cpu"))
            self._model = model.eval()
        return self._model

    def predict_heatmap(self, image: np.ndarray) -> np.ndarray:
        """Returns a float32 [H,W] heatmap in [0,1] where 1 = wall pixel."""
        model = self._lazy_load()
        h, w = image.shape
        tensor = torch.from_numpy(image).float().view(1, 1, h, w) / 255.0
        tensor = F.interpolate(tensor, size=(INPUT_SIZE, INPUT_SIZE), mode="bilinear", align_corners=False)
        tensor = (tensor.repeat(1, 3, 1, 1) - IMAGENET_MEAN) / IMAGENET_STD
        with torch.no_grad():
            logits = model(tensor)
            logits = F.interpolate(logits, size=(h, w), mode="bilinear", align_corners=False)
        return torch.sigmoid(logits).squeeze(0).squeeze(0).numpy().astype(np.float32)
