import Web3 from "web3";
// File này do `truffle compile/migrate` sinh ra (xem contracts_build_directory trong truffle-config.js).
// Nó chứa ABI + địa chỉ contract theo từng network id.
import DAOArtifact from "./contracts/DAO.json";

// Mạng Ganache local. Chain ID 1337 (= 0x539) là mặc định của Ganache GUI
// và của lệnh `npx ganache ... --chain.chainId 1337` trong README.
const GANACHE = {
  chainId: "0x539",
  chainName: "Ganache",
  rpcUrls: ["http://127.0.0.1:7545"],
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
};

/** Yêu cầu MetaMask chuyển sang Ganache; nếu MetaMask chưa có mạng này thì thêm vào. */
async function switchToGanache() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: GANACHE.chainId }],
    });
  } catch (e) {
    // 4902 = MetaMask chưa biết mạng này -> thêm mới (MetaMask tự chuyển sang sau khi thêm).
    const code = e?.data?.originalError?.code ?? e?.code;
    if (code !== 4902) throw e;
    await window.ethereum.request({ method: "wallet_addEthereumChain", params: [GANACHE] });
  }
}

/** Kết nối MetaMask, chuyển sang Ganache, lấy account và tạo đối tượng contract. */
export async function connectDAO() {
  if (!window.ethereum) throw new Error("Chưa cài MetaMask.");

  // Hiện popup MetaMask để người dùng cho phép trang web đọc địa chỉ ví.
  const [account] = await window.ethereum.request({ method: "eth_requestAccounts" });

  // Đang ở mạng khác (vd Mainnet = 0x1) -> hiện popup "Switch network" sang Ganache.
  if ((await window.ethereum.request({ method: "eth_chainId" })) !== GANACHE.chainId) {
    await switchToGanache();
  }

  const web3 = new Web3(window.ethereum);
  const networkId = String(await web3.eth.net.getId()); // web3 v4 trả về BigInt
  const deployed = DAOArtifact.networks[networkId];
  if (!deployed) {
    throw new Error(
      `Contract chưa deploy trên Ganache (network ${networkId}). Hãy chạy "truffle migrate --reset" rồi tải lại trang.`
    );
  }
  const contract = new web3.eth.Contract(DAOArtifact.abi, deployed.address);
  return { web3, account, contract };
}

/** Lấy lý do revert dễ đọc (vd "DAO: already voted") từ lỗi của MetaMask/web3. */
export function errorMessage(e) {
  const raw =
    e?.data?.message || e?.cause?.message || e?.innerError?.message || e?.message || String(e);
  const m = raw.match(/DAO: [^"'\n]+/);
  return m ? m[0] : raw;
}

export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
export const ZERO = "0x0000000000000000000000000000000000000000";
export const toDate = (ts) => new Date(Number(ts) * 1000).toLocaleString("vi-VN");
