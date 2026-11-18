# DAO-Delegate — DAO có cơ chế ủy quyền bỏ phiếu

Solidity 0.8.20 · OpenZeppelin 5 · Truffle 5 · Ganache · MetaMask · Web3.js 4 · React 18 + Bootstrap 5

---

## 1. Cấu trúc thư mục

```
DAO-Delegate/
├── contracts/
│   └── DAO.sol                    # Hợp đồng thông minh
├── migrations/
│   ├── 1_initial_migration.js     # Giữ cho đúng cấu trúc, không deploy gì
│   └── 2_deploy_contracts.js      # Deploy DAO + thêm 3 thành viên demo
├── test/
│   └── dao.test.js                # 19 test case
├── client/                        # Frontend React (Vite)
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx               # Điểm vào React, nạp Bootstrap
│       ├── App.jsx                # Dashboard: kết nối ví, đọc dữ liệu, gửi giao dịch
│       ├── web3.js                # Kết nối MetaMask + tạo contract + tiện ích
│       ├── contracts/             # (Truffle sinh ra) DAO.json = ABI + địa chỉ
│       └── components/
│           ├── ProposalList.jsx   # Danh sách Proposal, kết quả, Vote, Vote thay, Đóng
│           ├── CreateProposal.jsx # Form tạo Proposal
│           ├── DelegatePanel.jsx  # Ủy quyền / đổi / hủy + Lịch sử Delegate
│           └── MemberPanel.jsx    # Owner thêm / xóa thành viên
├── truffle-config.js
└── package.json
```

### Luồng dữ liệu tổng thể

```
 React (App.jsx) ──call()──►  web3.js ──► MetaMask ──► Ganache (blockchain) ──► DAO.sol
        ▲                                                         │
        └──────────── dữ liệu (proposals, history...) ◄───────────┘

 Nút bấm ──send()──► MetaMask hiện popup ký ──► giao dịch được đào ──► App tải lại dữ liệu
```

- **`call()`**: chỉ đọc (view), miễn phí, không cần ký.
- **`send()`**: thay đổi trạng thái, tốn gas, MetaMask bắt ký.

---

## 2. Smart Contract — `contracts/DAO.sol`

**Chức năng:** lưu thành viên, Proposal, phiếu bầu, quan hệ ủy quyền và lịch sử ủy quyền.

### 2.1 Kiểu dữ liệu

| Thành phần | Ý nghĩa |
|---|---|
| `enum Status { Active, Closed }` | Trạng thái Proposal. Enum rõ nghĩa hơn `bool`, dễ mở rộng (vd thêm `Executed`). |
| `struct Proposal` | `id, title, description, createdAt, status, yesVotes, noVotes` (+ `creator` để hiển thị ai tạo). |
| `struct DelegationRecord` | `delegator, delegatee, timestamp` — một dòng lịch sử. `delegatee = 0x0` nghĩa là hủy ủy quyền. |

### 2.2 Biến trạng thái (mapping + array)

| Biến | Vì sao chọn kiểu này |
|---|---|
| `mapping(address => bool) isMember` | Kiểm tra thành viên O(1), rẻ gas. |
| `Proposal[] proposals` | Mảng: `id` chính là chỉ số ⇒ không cần bộ đếm riêng. |
| `mapping(uint => mapping(address => bool)) hasVoted` | "Proposal X, địa chỉ Y đã được tính phiếu chưa" ⇒ chặn vote 2 lần. |
| `mapping(address => address) delegateOf` | Mỗi người chỉ ủy quyền cho **một** người tại một thời điểm. |
| `DelegationRecord[] delegationHistory` | Lưu **toàn bộ** lịch sử, chỉ thêm, không xóa. |

### 2.3 Modifier

- `onlyOwner` (từ OpenZeppelin): chỉ Owner thêm/xóa thành viên, đóng Proposal.
- `onlyMember`: chỉ thành viên tạo Proposal, vote, delegate.
- `proposalExists(id)`: chặn truy cập id không tồn tại (`id < proposals.length`).
- `onlyActive(id)`: chặn vote khi Proposal đã `Closed`.

Modifier giúp gom các `require()` lặp lại vào một chỗ, hàm chính chỉ còn logic nghiệp vụ.

### 2.4 Các hàm

| Hàm | Ai gọi | Làm gì |
|---|---|---|
| `constructor()` | người deploy | `Ownable(msg.sender)` đặt Owner, rồi thêm Owner làm thành viên đầu tiên. |
| `addMember / removeMember` | Owner | Thêm / xóa thành viên. Không xóa được Owner. Khi xóa, ủy quyền **của người đó** bị hủy. |
| `createProposal(title, desc)` | thành viên | `push` Proposal mới, `id = proposals.length`, `createdAt = block.timestamp`. |
| `vote(id, support)` | thành viên **chưa** ủy quyền | Tự bỏ phiếu YES (`true`) / NO (`false`). Nếu trước đó người được ủy quyền đã vote thay mình thì phiếu đó bị gỡ và thay bằng phiếu tự bỏ (`_removeVote`). |
| `voteOnBehalf(id, delegator, support)` | người được ủy quyền | Bỏ phiếu thay cho `delegator` (yêu cầu `delegateOf[delegator] == msg.sender`). |
| `_castVote` (internal) | — | Logic chung: kiểm tra `hasVoted`, đánh dấu, cộng phiếu, `emit Voted`. |
| `delegate(to)` | thành viên | Ủy quyền hoặc **đổi** người được ủy quyền. |
| `undelegate()` | thành viên | Hủy ủy quyền để tự vote lại, kể cả ở Proposal đã được vote thay (miễn còn Active). |
| `_createsLoop` (internal view) | — | Phát hiện vòng lặp ủy quyền. |
| `closeProposal(id)` | Owner | Chuyển sang `Closed`, sau đó không vote được nữa. |
| `getResult(id)` | ai cũng được | Trả `(yesVotes, noVotes, isActive)`. |
| `getProposal / getAllProposals / proposalCount` | ai cũng được | Đọc Proposal. |
| `getDelegationHistory()` | ai cũng được | Trả toàn bộ lịch sử delegate. |

### 2.5 Cơ chế Delegate — tại sao thiết kế như vậy

**Quy tắc:** A ủy quyền cho B ⇒ A không tự vote được nữa (`"voting power delegated"`), B gọi `voteOnBehalf(id, A, ...)` để bỏ phiếu thay A. Phiếu vẫn được tính **cho A** (`hasVoted[id][A] = true`), nên:
- B vẫn có phiếu riêng của mình (gọi `vote`).
- Không ai bỏ phiếu cho A được 2 lần. Riêng trường hợp B đã vote thay rồi A hủy ủy quyền: A **vẫn tự vote được** — phiếu B bỏ thay bị gỡ (`yesVotes`/`noVotes` trừ 1, event `VoteRemoved`) rồi tính phiếu mới của A. Contract lưu `castBy` (ai bấm vote) và phiếu YES/NO của từng người để biết cần gỡ phiếu nào. Phiếu A tự bỏ thì không thay được nữa.

**Chống vòng lặp** (`_createsLoop`): khi A muốn ủy quyền cho `to`, đi theo chuỗi `to → delegateOf[to] → ...`. Nếu gặp lại A thì từ chối.

```
B → C đã có, A → B đã có.  C muốn delegate cho A:
  đi từ A: A → B → C  == C (người gọi)  ⇒ vòng lặp ⇒ revert "DAO: delegation loop"
```

Vòng `while` luôn dừng vì hợp đồng **không bao giờ** cho phép tồn tại vòng lặp, nên chuỗi luôn kết thúc ở `address(0)`.

> Vì sao không cộng dồn phiếu tự động (B vote 1 lần = 2 phiếu)? Cách đó phải duyệt toàn bộ thành viên mỗi lần vote (tốn gas, khó hiểu hơn). Cách "vote thay từng người" minh bạch: mỗi phiếu có một sự kiện `Voted(id, voter, castBy, support)` riêng.

### 2.6 Events

`MemberAdded`, `MemberRemoved`, `ProposalCreated`, `Voted`, `Delegated`, `ProposalClosed`. Event được ghi vào log giao dịch: rẻ hơn lưu storage, frontend/explorer có thể lắng nghe hoặc truy vấn lại.

---

## 3. OpenZeppelin — dùng gì, vì sao

| Thư viện | Dùng? | Lý do |
|---|---|---|
| **Ownable** | ✅ | Có sẵn `owner()`, `onlyOwner`, `transferOwnership` đã được kiểm toán. Tự viết dễ sai. Bản 5.x bắt truyền owner vào constructor: `Ownable(msg.sender)`. |
| **ReentrancyGuard** | ❌ | Chỉ cần khi hợp đồng **gửi ETH hoặc gọi hợp đồng bên ngoài** giữa chừng. `DAO.sol` không làm cả hai, nên thêm vào chỉ tốn gas mà không bảo vệ gì. Nếu sau này thêm chức năng rút quỹ thì mới cần. |
| **Counters** | ❌ | Đã bị **xóa khỏi OpenZeppelin 5**. Solidity 0.8 tự kiểm tra tràn số, và `proposals.length` đã là bộ đếm. |

---

## 4. Cài đặt Truffle & project

> Dự án đã có sẵn mọi file. Phần "tạo từ đầu" dưới đây để bạn hiểu từng bước.

### 4.1 Yêu cầu
- Node.js 18 LTS hoặc 20 LTS (khuyên dùng; Node 24 chạy được nhưng có cảnh báo, xem mục 8).
- Ganache GUI: https://archive.trufflesuite.com/ganache/ (hoặc dùng `npx ganache`).
- MetaMask extension trên Chrome/Edge/Firefox.

### 4.2 Tạo project từ đầu (tham khảo)
```bash
npm install -g truffle
```
```bash
mkdir DAO-Delegate && cd DAO-Delegate && truffle init
```
```bash
npm install @openzeppelin/contracts@5.0.2
```
`truffle init` tạo sẵn `contracts/`, `migrations/`, `test/`, `truffle-config.js`. Sau đó chép các file của dự án này vào.

### 4.3 Với dự án này
```bash
npm install
```
```bash
cd client && npm install
```

### 4.4 `truffle-config.js` — giải thích
- `contracts_build_directory: client/src/contracts` → `truffle compile/migrate` ghi `DAO.json` (ABI + địa chỉ theo network) thẳng vào React. **Không cần copy ABI bằng tay.**
- `networks.development`: Ganache GUI chạy ở `127.0.0.1:7545`. `network_id: "*"` = chấp nhận mọi id.
- `solc.version: 0.8.20`: OpenZeppelin 5 yêu cầu tối thiểu 0.8.20.
- `evmVersion: "paris"`: solc 0.8.20 mặc định sinh opcode `PUSH0` (Shanghai) mà Ganache GUI chưa hỗ trợ ⇒ lỗi `invalid opcode` khi deploy. Chọn `paris` để tránh.

---

## 5. Migration

### `migrations/1_initial_migration.js`
Truffle ≥ 5.4 không còn cần `Migrations.sol`. File giữ lại cho đúng cấu trúc, hàm nhận `deployer` nhưng không làm gì (Truffle bắt hàm migration phải có tham số).

### `migrations/2_deploy_contracts.js`
```js
const DAO = artifacts.require("DAO");          // lấy artifact đã compile
module.exports = async function (deployer, network, accounts) {
  await deployer.deploy(DAO);                   // accounts[0] deploy => Owner
  const dao = await DAO.deployed();
  if (network === "development") {              // chỉ trên local
    for (const acc of accounts.slice(1, 4)) await dao.addMember(acc);
  }
};
```
- Truffle chạy các file theo **số thứ tự đầu tên** (1, 2, ...).
- `deployer.deploy` gửi giao dịch tạo hợp đồng và lưu địa chỉ vào `DAO.json` → `networks[<id>].address`. Frontend đọc địa chỉ từ đây.
- Thêm sẵn account 1–3 làm thành viên để demo nhanh, không phải bấm thêm tay.
- `--reset` = deploy lại từ đầu (bắt buộc khi sửa contract).

---

## 6. Test — `test/dao.test.js`

**Nguyên lý:** Truffle chạy Mocha + Chai. `contract("DAO", accounts => ...)` cấp 10 account Ganache. `beforeEach` deploy **hợp đồng mới** cho mỗi test ⇒ các test độc lập. Hàm `expectRevert` bắt lỗi và kiểm tra lý do revert.

| Nhóm | Test case |
|---|---|
| Thành viên | thêm thành viên · không phải owner không thêm được · xóa thành viên · người ngoài không tạo được proposal |
| Proposal & Vote | tạo proposal · vote YES · vote NO · vote 2 lần bị chặn |
| Delegate | delegate + vote thay · đổi delegate · delegate cho chính mình · delegate cho người ngoài · vòng lặp A→B→C→A · hủy ủy quyền rồi tự vote · hủy ủy quyền rồi vote đè phiếu đã được vote thay · xem lịch sử delegate |
| Đóng Proposal | owner đóng · không phải owner không đóng được · vote sau khi đóng bị chặn |

```bash
truffle test
```
Kết quả mong đợi: `19 passing`. (Cần Ganache đang chạy ở cổng 7545.)

> Lỗi `onlyOwner` của OpenZeppelin 5 là *custom error* `OwnableUnauthorizedAccount`; Truffle không giải mã được tên nên test chỉ kiểm tra là có `revert`.

---

## 7. Frontend React

Dùng **Vite** thay `create-react-app` (CRA đã ngừng phát triển, chậm và lỗi với Node mới).

| File | Chức năng | Tại sao viết vậy |
|---|---|---|
| `main.jsx` | Gắn `<App/>` vào `#root`, import CSS Bootstrap. | Điểm vào chuẩn của React. |
| `web3.js` | `connectDAO()`: kiểm tra `window.ethereum` → `eth_requestAccounts` (popup MetaMask) → lấy `networkId` → tìm địa chỉ trong `DAO.json` → `new web3.eth.Contract(abi, address)`. `errorMessage()` lọc ra chuỗi `DAO: ...` từ lỗi. | Gom mọi thứ "nói chuyện với blockchain" vào một chỗ; component chỉ lo giao diện. |
| `App.jsx` | Giữ state; `load()` đọc owner, isMember, delegateOf, proposals, history bằng `call()`; `send()` = `estimateGas` → `send({from})` → `load()` lại. Lắng nghe `accountsChanged`/`chainChanged` để tải lại. | Một nguồn dữ liệu duy nhất, truyền xuống component qua props ⇒ dễ theo dõi. `estimateGas` trước giúp báo lỗi revert **trước khi** mở popup. |
| `ProposalList.jsx` | Thẻ Proposal: tiêu đề, mô tả, thời gian, badge Active/Closed, YES/NO + thanh tỉ lệ; ô chọn "Bản thân / Thay cho 0x..." + nút YES/NO; nút Đóng (Owner). | "Vote thay" chỉ hiện những người đang ủy quyền cho mình. |
| `CreateProposal.jsx` | Form tiêu đề + mô tả → `createProposal`. | |
| `DelegatePanel.jsx` | Đang ủy quyền cho ai, ai ủy quyền cho mình, ô nhập địa chỉ → `delegate`, nút `undelegate`; bảng Lịch sử Delegate. | "Ai ủy quyền cho mình" tính từ lịch sử (bản ghi mới nhất của từng người) ⇒ không cần thêm hàm vào contract. |
| `MemberPanel.jsx` | Owner nhập địa chỉ → `addMember` / `removeMember`. | Chỉ hiện khi account là Owner. |

**Lưu ý web3 v4:** số `uint256` trả về là `BigInt` (vd `5n`) ⇒ dùng `Number(x)` hoặc `String(x)` trước khi hiển thị.

### Tóm tắt "kết nối Smart Contract"
1. **ABI**: `truffle compile` sinh `client/src/contracts/DAO.json` (chứa `abi` và `networks`).
2. **Kết nối MetaMask**: `new Web3(window.ethereum)`.
3. **Lấy account**: `await window.ethereum.request({ method: "eth_requestAccounts" })`.
4. **Gọi hàm đọc**: `await contract.methods.getResult(0).call()`.
5. **Gửi transaction**: `await contract.methods.vote(0, true).send({ from: account })`.

---

## 8. Chạy dự án từng bước

### Bước 1 — Mở Ganache
- Ganache GUI → **Quickstart (Ethereum)**. RPC server `HTTP://127.0.0.1:7545`, Network ID `5777`, Chain ID `1337`.
- Hoặc dùng CLI (không cần cài GUI):
```bash
npx ganache@7.9.1 -p 7545 -i 5777 --chain.chainId 1337
```
(CLI in ra 10 private key ở đầu, dùng để import vào MetaMask.)

### Bước 2 — Compile
```bash
truffle compile
```

### Bước 3 — Deploy
```bash
truffle migrate --reset
```
Ghi lại dòng `DAO deployed at: 0x...`.

### Bước 4 — Kết nối MetaMask
1. **Mạng Ganache**: không cần thêm tay. Khi bấm *Kết nối MetaMask*, trang web tự yêu cầu MetaMask thêm / chuyển sang Ganache (popup *Add network* / *Switch network* → bấm **Approve / Switch network**). Nếu muốn thêm tay: MetaMask → chọn mạng → **Add a custom network**:
   - Network name: `Ganache`
   - RPC URL: `http://127.0.0.1:7545`
   - Chain ID: `1337`
   - Currency symbol: `ETH`
2. **Import account**: trong Ganache GUI bấm 🔑 cạnh account → copy private key → MetaMask → *Add account → Import account* → dán.
   Import ít nhất **account 0** (Owner) và **account 1, 2** (thành viên do migration thêm sẵn).

> Đây là private key **của Ganache local**, chỉ dùng thử. Không bao giờ dán private key ví thật vào đâu cả.

### Bước 5 — Chạy React
```bash
cd client && npm run dev
```
Mở http://localhost:3000 → **Kết nối MetaMask**.

### Bước 6 — Vote
1. Account 0 (Owner): tạo Proposal "Tăng quỹ".
2. Đổi sang account 1 trong MetaMask (trang tự tải lại) → Kết nối → chọn "Bản thân" → **YES**.
3. Bấm YES lần nữa → báo `DAO: already voted`.

### Bước 7 — Delegate
1. Account 2: ô Delegate nhập địa chỉ account 1 → **Ủy quyền**.
2. Đổi sang account 1 → ở Proposal chọn **"Thay cho 0x…(account 2)"** → **NO**. Kết quả: YES 1, NO 1.
3. Thử tạo vòng lặp: account 1 ủy quyền cho account 2 → báo `DAO: delegation loop`.

### Bước 8 — Xem lịch sử
Bảng **Lịch sử Delegate** ở panel bên phải: người ủy quyền, người nhận, thời gian. Dòng "hủy" là `undelegate`.

### Bước 9 — Kiểm thử
1. Account 0: **Đóng Proposal** → badge chuyển *Closed*, nút vote biến mất.
2. Chạy bộ test tự động:
```bash
truffle test
```

---

## 9. Lỗi thường gặp

| Lỗi | Nguyên nhân | Cách sửa |
|---|---|---|
| `Could not connect to your Ethereum client` / `CONNECTION ERROR ... 7545` | Ganache chưa chạy hoặc sai cổng. | Mở Ganache; nếu dùng cổng 8545 thì sửa `port` trong `truffle-config.js`. |
| `invalid opcode` khi migrate | Bytecode có `PUSH0`, Ganache cũ không hỗ trợ. | Giữ `evmVersion: "paris"` trong `truffle-config.js`. |
| `Source "@openzeppelin/contracts/..." not found` | Chưa cài OpenZeppelin. | `npm install` ở thư mục gốc. |
| `Migration ... invalid or does not take any parameters` | Hàm migration không có tham số. | Hàm phải là `function (deployer) {...}`. |
| Frontend: `Contract chưa deploy trên Ganache ...` | Chưa migrate sau khi khởi động lại Ganache. | Chạy `truffle migrate --reset`, tải lại trang. |
| MetaMask báo `Could not fetch chain ID` khi thêm mạng | Ganache chưa chạy. | Mở Ganache trước rồi bấm Kết nối lại. |
| `Failed to resolve import "./contracts/DAO.json"` | Chưa compile. | `truffle compile` ở thư mục gốc. |
| MetaMask: `nonce too high` / giao dịch treo | Ganache khởi động lại nhưng MetaMask nhớ nonce cũ. | MetaMask → Settings → Advanced → **Clear activity tab data**. |
| `DAO: not a member` | Account chưa được Owner thêm. | Dùng account 0 thêm địa chỉ đó ở panel Quản lý thành viên. |
| `npm install` lỗi `gyp ERR!` khi cài `truffle` cục bộ (Node 22+) | Truffle có module native cũ. | Cài global `npm i -g truffle`, hoặc dùng Node 18/20 LTS. |
| Cảnh báo `This version of µWS is not compatible...` | Node mới, Ganache tích hợp của Truffle tự chuyển sang bản JS. | Bỏ qua được; hết khi dùng Node 18/20. |
| `vite` lỗi `An Application Control policy has blocked this file ... rollup...node` (Windows 11) | Smart App Control chặn file native của Rollup. | Đã xử lý sẵn: `client/package.json` dùng `overrides` sang `@rollup/wasm-node`. |
