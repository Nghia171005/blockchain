import { useState } from "react";
import { short, toDate } from "../web3";

/** Danh sách Proposal + kết quả + nút Vote / Vote thay / Đóng. */
export default function ProposalList(props) {
  const { proposals } = props.data;
  if (proposals.length === 0) return <div className="alert alert-info">Chưa có Proposal nào.</div>;

  return (
    <div className="d-flex flex-column gap-3">
      <h2 className="h5 m-0">Danh sách Proposal</h2>
      {[...proposals].reverse().map((p) => (
        <ProposalCard key={String(p.id)} p={p} {...props} />
      ))}
    </div>
  );
}

function ProposalCard({ p, dao, data, busy, send }) {
  const { isMember, isOwner, myDelegate, delegators } = data;
  // Các lựa chọn: "self" = tự bỏ phiếu (khi chưa ủy quyền), + địa chỉ những người đã ủy quyền cho mình.
  const options = [...(myDelegate ? [] : ["self"]), ...delegators];
  const [picked, setVoteAs] = useState("self");
  // Sau khi delegate / hủy delegate, lựa chọn cũ có thể không còn -> tự rơi về lựa chọn đầu tiên.
  const voteAs = options.includes(picked) ? picked : options[0] ?? "";
  const m = dao.contract.methods;
  const id = p.id;
  const active = Number(p.status) === 0; // enum Status { Active, Closed }
  const yes = Number(p.yesVotes);
  const no = Number(p.noVotes);
  const total = yes + no;
  const yesPct = total ? Math.round((yes * 100) / total) : 0;

  const vote = (support) =>
    voteAs === "self"
      ? send(m.vote(id, support), `Đã vote ${support ? "YES" : "NO"}`)
      : send(m.voteOnBehalf(id, voteAs, support), `Đã vote thay ${short(voteAs)}`);

  return (
    <div className="card">
      <div className="card-body">
        <div className="d-flex justify-content-between gap-2">
          <h3 className="h6">#{String(id)} · {p.title}</h3>
          <span className={`badge align-self-start ${active ? "bg-success" : "bg-secondary"}`}>
            {active ? "Active" : "Closed"}
          </span>
        </div>
        <p className="mb-1">{p.description}</p>
        <small className="text-muted">Tạo bởi {short(p.creator)} lúc {toDate(p.createdAt)}</small>

        {/* Kết quả vote */}
        <div className="mt-2">
          <div className="d-flex justify-content-between small">
            <span>YES: {yes}</span><span>NO: {no}</span>
          </div>
          <div className="progress-stacked" aria-label={`YES ${yes}, NO ${no}`}>
            <div className="progress" style={{ width: `${yesPct}%` }}>
              <div className="progress-bar bg-success" />
            </div>
            <div className="progress" style={{ width: `${total ? 100 - yesPct : 0}%` }}>
              <div className="progress-bar bg-danger" />
            </div>
          </div>
        </div>

        {active && isMember && (
          <div className="d-flex flex-wrap gap-2 mt-3 align-items-center">
            <select className="form-select form-select-sm w-auto" value={voteAs}
              onChange={(e) => setVoteAs(e.target.value)} aria-label="Bỏ phiếu với tư cách">
              {!myDelegate && <option value="self">Bản thân</option>}
              {delegators.map((d) => <option key={d} value={d}>Thay cho {short(d)}</option>)}
            </select>
            <button className="btn btn-sm btn-success" disabled={busy || !voteAs} onClick={() => vote(true)}>YES</button>
            <button className="btn btn-sm btn-danger" disabled={busy || !voteAs} onClick={() => vote(false)}>NO</button>
            {myDelegate && (
              <small className="text-muted">Bạn đã ủy quyền cho {short(myDelegate)}.</small>
            )}
          </div>
        )}

        {active && isOwner && (
          <button className="btn btn-sm btn-outline-secondary mt-2" disabled={busy}
            onClick={() => send(m.closeProposal(id), "Đã đóng Proposal")}>Đóng Proposal</button>
        )}
      </div>
    </div>
  );
}
