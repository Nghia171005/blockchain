import { useEffect, useState } from "react";
import { connectDAO, errorMessage, short, ZERO } from "./web3";
import MemberPanel from "./components/MemberPanel";
import CreateProposal from "./components/CreateProposal";
import ProposalList from "./components/ProposalList";
import DelegatePanel from "./components/DelegatePanel";

export default function App() {
  const [dao, setDao] = useState(null); // { web3, account, contract }
  const [data, setData] = useState(null); // dữ liệu đọc từ blockchain
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type: "success" | "danger", text }

  // Đổi account/mạng trong MetaMask -> tải lại trang cho đơn giản và chắc chắn.
  useEffect(() => {
    if (!window.ethereum) return;
    // Trang đã được cấp quyền trước đó (vd vừa tải lại sau khi đổi mạng) -> tự kết nối lại, không cần bấm nút.
    window.ethereum.request({ method: "eth_accounts" }).then((acc) => acc.length && connect());
    const reload = () => window.location.reload();
    window.ethereum.on("accountsChanged", reload);
    window.ethereum.on("chainChanged", reload);
    return () => {
      window.ethereum.removeListener("accountsChanged", reload);
      window.ethereum.removeListener("chainChanged", reload);
    };
  }, []);

  async function connect() {
    try {
      const d = await connectDAO();
      setDao(d);
      await load(d);
    } catch (e) {
      setMsg({ type: "danger", text: errorMessage(e) });
    }
  }

  /** Đọc toàn bộ trạng thái cần hiển thị (call = miễn phí, không cần ký). */
  async function load({ account, contract } = dao) {
    const m = contract.methods;
    const [owner, isMember, myDelegate, proposals, history] = await Promise.all([
      m.owner().call(),
      m.isMember(account).call(),
      m.delegateOf(account).call(),
      m.getAllProposals().call(),
      m.getDelegationHistory().call(),
    ]);

    // Ai đang ủy quyền cho mình? = bản ghi MỚI NHẤT của mỗi delegator trỏ tới mình.
    const latest = {};
    for (const h of history) latest[h.delegator] = h.delegatee;
    const delegators = Object.keys(latest).filter(
      (from) => latest[from].toLowerCase() === account.toLowerCase()
    );

    setData({
      isOwner: owner.toLowerCase() === account.toLowerCase(),
      isMember,
      myDelegate: myDelegate === ZERO ? null : myDelegate,
      proposals,
      history,
      delegators,
    });
  }

  /** Gửi transaction (MetaMask hiện popup để ký), sau đó tải lại dữ liệu. */
  async function send(method, okText) {
    setBusy(true);
    setMsg(null);
    try {
      // Ước lượng gas trước: nếu giao dịch sẽ revert thì báo lỗi ngay, không mở popup vô ích.
      const gas = await method.estimateGas({ from: dao.account });
      await method.send({ from: dao.account, gas });
      setMsg({ type: "success", text: okText });
      await load();
    } catch (e) {
      setMsg({ type: "danger", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  const props = { dao, data, busy, send };

  return (
    <div className="container py-4">
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-2">
        <h1 className="h3 m-0">DAO Delegate Dashboard</h1>
        {dao ? (
          <span>
            <span className="badge bg-secondary me-1">{short(dao.account)}</span>
            {data?.isOwner && <span className="badge bg-warning text-dark me-1">Owner</span>}
            {data?.isMember ? (
              <span className="badge bg-success">Thành viên</span>
            ) : (
              <span className="badge bg-danger">Không phải thành viên</span>
            )}
          </span>
        ) : (
          <button className="btn btn-primary" onClick={connect}>Kết nối MetaMask</button>
        )}
      </div>

      {msg && <div className={`alert alert-${msg.type}`} role="alert">{msg.text}</div>}

      {data && (
        <div className="row g-4">
          <div className="col-lg-8">
            <ProposalList {...props} />
          </div>
          <div className="col-lg-4 d-flex flex-column gap-4">
            {data.isOwner && <MemberPanel {...props} />}
            {data.isMember && <CreateProposal {...props} />}
            {data.isMember && <DelegatePanel {...props} />}
          </div>
        </div>
      )}
    </div>
  );
}
