import torch
from torch_geometric.nn import GCNConv

class WallEndpointGNN(torch.nn.Module):
    """Edge-classification GNN: nodes are wall endpoints, edges connect
    candidate junction pairs within a coarse radius; output is a per-edge
    probability that the two endpoints represent the same physical junction.
    Training script and checkpoint are a Phase-2-later data task; this module
    defines the architecture pipeline.py's heal_wall_topology can call."""

    def __init__(self, in_channels: int = 2, hidden_channels: int = 32):
        super().__init__()
        self.conv1 = GCNConv(in_channels, hidden_channels)
        self.conv2 = GCNConv(hidden_channels, hidden_channels)
        self.edge_classifier = torch.nn.Linear(hidden_channels * 2, 1)

    def forward(self, node_features: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        x = torch.relu(self.conv1(node_features, edge_index))
        x = torch.relu(self.conv2(x, edge_index))
        src, dst = edge_index
        pair_features = torch.cat([x[src], x[dst]], dim=1)
        return torch.sigmoid(self.edge_classifier(pair_features)).squeeze(-1)
