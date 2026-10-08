import pycrdt
from pycrdt.websocket.yroom import create_sync_message, handle_sync_message
from kikyo.collab.protocol import CRDTSessionBridge


def test_crdt_hydration():
    bridge = CRDTSessionBridge()
    bridge.init_cells([("c1", "x = 10"), ("c2", "y = 20")])

    assert bridge.get_cell_text("c1") == "x = 10"
    assert bridge.get_cell_text("c2") == "y = 20"


def test_crdt_sync_handshake():
    server_bridge = CRDTSessionBridge()
    server_bridge.init_cells([("c1", "server_val = 100")])

    # 1. Client connects with an empty document and sends framed SyncStep1
    client_doc = pycrdt.Doc()
    client_step1 = create_sync_message(client_doc)

    # 2. Server handles client's SyncStep1 and generates framed SyncStep2 response
    server_step2 = server_bridge.handle_client_message(client_step1)
    assert server_step2 is not None

    # 3. Client un-frames and processes server's SyncStep2 response
    handle_sync_message(server_step2[1:], client_doc)

    # 4. Client now has all cells synchronized
    m = client_doc.get("cells", type=pycrdt.Map)
    assert "c1" in m
    assert str(m["c1"]) == "server_val = 100"
