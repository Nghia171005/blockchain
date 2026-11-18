const path = require("path");

module.exports = {
  // Ghi ABI + địa chỉ đã deploy thẳng vào React để frontend import trực tiếp.
  contracts_build_directory: path.join(__dirname, "client/src/contracts"),

  networks: {
    // Ganache GUI mặc định: 127.0.0.1:7545, network id 5777.
    // Nếu dùng ganache CLI (`npx ganache`) thì đổi port thành 8545.
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*",
    },
  },

  compilers: {
    solc: {
      version: "0.8.20", // OpenZeppelin 5 yêu cầu >= 0.8.20
      settings: {
        optimizer: { enabled: true, runs: 200 },
        // Ganache GUI chưa hỗ trợ opcode PUSH0 (Shanghai) -> biên dịch cho "paris".
        evmVersion: "paris",
      },
    },
  },
};
