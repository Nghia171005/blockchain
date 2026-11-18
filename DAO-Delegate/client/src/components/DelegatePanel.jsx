import { useState } from "react";
import { short, toDate, ZERO } from "../web3";

/** Ủy quyền, đổi / hủy ủy quyền và lịch sử delegate. */
export default function DelegatePanel({ dao, data, busy, send }) {
  const [to, setTo] = useState("");
  const m = dao.contract.methods;
  const { myDelegate, delegators, history } = data;

  return (
    <div className="card">
      <div className="card-header fw-semibold">Delegate</div>
      <div className="card-body">
        <p className="small mb-2">
          Đang ủy quyền cho: <b>{myDelegate ? short(myDelegate) : "không ai"}</b><br />
          Được ủy quyền bởi: <b>{delegators.length ? delegators.map(short).join(", ") : "không ai"}</b>
        </p>
        <input className="form-control mb-2" placeholder="0x... người được ủy quyền" aria-label="Địa chỉ người được ủy quyền"
          value={to} onChange={(e) => setTo(e.target.value.trim())} />
        <div className="d-flex gap-2">
          <button className="btn btn-primary" disabled={busy || !dao.web3.utils.isAddress(to)}
            onClick={() => send(m.delegate(to), "Đã ủy quyền")}>{myDelegate ? "Đổi delegate" : "Ủy quyền"}</button>
          {myDelegate && (
            <button className="btn btn-outline-secondary" disabled={busy}
              onClick={() => send(m.undelegate(), "Đã hủy ủy quyền")}>Hủy ủy quyền</button>
          )}
        </div>

        <h3 className="h6 mt-4">Lịch sử Delegate</h3>
        {history.length === 0 ? (
          <p className="small text-muted">Chưa có.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm small">
              <thead><tr><th>Người ủy quyền</th><th>Người nhận</th><th>Thời gian</th></tr></thead>
              <tbody>
                {[...history].reverse().map((h, i) => (
                  <tr key={i}>
                    <td>{short(h.delegator)}</td>
                    <td>{h.delegatee === ZERO ? <i>hủy</i> : short(h.delegatee)}</td>
                    <td>{toDate(h.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
