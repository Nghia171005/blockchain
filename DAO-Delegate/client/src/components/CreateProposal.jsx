import { useState } from "react";

export default function CreateProposal({ dao, busy, send }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

  async function submit(e) {
    e.preventDefault(); // chặn form reload trang
    await send(dao.contract.methods.createProposal(title, desc), "Đã tạo Proposal");
    setTitle("");
    setDesc("");
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="card-header fw-semibold">Tạo Proposal</div>
      <div className="card-body">
        <input className="form-control mb-2" placeholder="Tiêu đề" aria-label="Tiêu đề" required
          value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="form-control mb-2" placeholder="Mô tả" aria-label="Mô tả" rows={3}
          value={desc} onChange={(e) => setDesc(e.target.value)} />
        <button className="btn btn-primary" disabled={busy}>Tạo</button>
      </div>
    </form>
  );
}
