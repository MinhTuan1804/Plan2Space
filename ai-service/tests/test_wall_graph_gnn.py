# ai-service/tests/test_wall_graph_gnn.py
import torch
from models.wall_graph_gnn import WallEndpointGNN

def test_gnn_outputs_one_probability_per_candidate_edge():
    nodes = torch.tensor([[0.0, 0.0], [5.0, 0.0], [5.03, 0.0], [5.03, 4.0]])
    edge_index = torch.tensor([[1, 2], [2, 1]])
    probs = WallEndpointGNN()(nodes, edge_index)
    assert probs.shape == (2,)
    assert torch.all((probs >= 0) & (probs <= 1))
