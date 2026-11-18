import { useState } from "react";

/** Chỉ hiện với Owner: thêm / xóa thành viên. */
export default function MemberPanel({ dao, busy, send }) {
  const [addr, setAddr] = useState("");
  const m = dao.contract.methods;
  const valid = dao.web3.utils.isAddress(addr);

  return (
    <div className="card">
      <div className="card-header fw-semibold">Quản lý thành viên (Owner)</div>
      <div className="card-body">
        <input className="form-control mb-2" placeholder="0x... địa chỉ ví" aria-label="Địa chỉ thành viên"
          value={addr} onChange={(e) => setAddr(e.target.value.trim())} />
        <div className="d-flex gap-2">
          <button className="btn btn-success" disabled={busy || !valid}
            onClick={() => send(m.addMember(addr), "Đã thêm thành viên")}>Thêm</button>
          <button className="btn btn-outline-danger" disabled={busy || !valid}
            onClick={() => send(m.removeMember(addr), "Đã xóa thành viên")}>Xóa</button>
        </div>
      </div>
    </div>
  );
}
