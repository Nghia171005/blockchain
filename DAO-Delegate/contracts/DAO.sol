// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title DAO có cơ chế ủy quyền bỏ phiếu (Delegate)
/// @notice Owner quản lý thành viên; thành viên tạo Proposal, bỏ phiếu, ủy quyền.
contract DAO is Ownable {
    // ───────────── Kiểu dữ liệu ─────────────
    enum Status { Active, Closed }

    struct Proposal {
        uint256 id;
        string title;
        string description;
        uint256 createdAt;
        Status status;
        uint256 yesVotes;
        uint256 noVotes;
        address creator;
    }

    struct DelegationRecord {
        address delegator; // người ủy quyền
        address delegatee; // người được ủy quyền (address(0) = hủy ủy quyền)
        uint256 timestamp;
    }

    // ───────────── Trạng thái ─────────────
    mapping(address => bool) public isMember;
    uint256 public memberCount;

    Proposal[] private proposals;
    // proposalId => voter => đã được tính phiếu chưa
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    // proposalId => voter => ai đã bấm vote (chính voter, hoặc người được ủy quyền)
    mapping(uint256 => mapping(address => address)) public castBy;
    // proposalId => voter => phiếu đã bỏ là YES (true) hay NO (false)
    mapping(uint256 => mapping(address => bool)) private votedYes;

    // delegator => delegatee hiện tại
    mapping(address => address) public delegateOf;
    DelegationRecord[] private delegationHistory;

    // ───────────── Events ─────────────
    event MemberAdded(address indexed member);
    event MemberRemoved(address indexed member);
    event ProposalCreated(uint256 indexed id, string title, address indexed creator);
    event Voted(uint256 indexed id, address indexed voter, address indexed castBy, bool support);
    event VoteRemoved(uint256 indexed id, address indexed voter, address indexed castBy);
    event Delegated(address indexed delegator, address indexed delegatee, uint256 timestamp);
    event ProposalClosed(uint256 indexed id);

    // ───────────── Modifiers ─────────────
    modifier onlyMember() {
        require(isMember[msg.sender], "DAO: not a member");
        _;
    }

    modifier proposalExists(uint256 id) {
        require(id < proposals.length, "DAO: proposal not found");
        _;
    }

    modifier onlyActive(uint256 id) {
        require(proposals[id].status == Status.Active, "DAO: proposal closed");
        _;
    }

    // ───────────── Constructor ─────────────
    /// Người deploy là Owner và đồng thời là thành viên đầu tiên.
    constructor() Ownable(msg.sender) {
        _addMember(msg.sender);
    }

    // ───────────── 1. Quản lý thành viên ─────────────
    function addMember(address member) external onlyOwner {
        require(member != address(0), "DAO: zero address");
        require(!isMember[member], "DAO: already a member");
        _addMember(member);
    }

    function removeMember(address member) external onlyOwner {
        require(isMember[member], "DAO: not a member");
        require(member != owner(), "DAO: cannot remove owner");
        isMember[member] = false;
        memberCount--;
        delete delegateOf[member]; // ủy quyền của người bị xóa không còn hiệu lực
        emit MemberRemoved(member);
    }

    function _addMember(address member) internal {
        isMember[member] = true;
        memberCount++;
        emit MemberAdded(member);
    }

    // ───────────── 2. Tạo Proposal ─────────────
    function createProposal(string calldata title, string calldata description)
        external
        onlyMember
        returns (uint256 id)
    {
        require(bytes(title).length > 0, "DAO: empty title");
        id = proposals.length;
        proposals.push(Proposal({
            id: id,
            title: title,
            description: description,
            createdAt: block.timestamp,
            status: Status.Active,
            yesVotes: 0,
            noVotes: 0,
            creator: msg.sender
        }));
        emit ProposalCreated(id, title, msg.sender);
    }

    // ───────────── 3. Bỏ phiếu ─────────────
    /// Tự bỏ phiếu. Nếu đã ủy quyền cho người khác thì phải hủy ủy quyền trước.
    /// Nếu người được ủy quyền đã vote thay mình ở Proposal này, phiếu đó bị gỡ
    /// và thay bằng phiếu tự bỏ (vẫn chỉ tính 1 phiếu cho mỗi người).
    function vote(uint256 id, bool support)
        external
        onlyMember
        proposalExists(id)
        onlyActive(id)
    {
        require(delegateOf[msg.sender] == address(0), "DAO: voting power delegated");
        if (hasVoted[id][msg.sender]) {
            require(castBy[id][msg.sender] != msg.sender, "DAO: already voted");
            _removeVote(id, msg.sender);
        }
        _castVote(id, msg.sender, support);
    }

    /// Người được ủy quyền bỏ phiếu thay cho `delegator`.
    function voteOnBehalf(uint256 id, address delegator, bool support)
        external
        onlyMember
        proposalExists(id)
        onlyActive(id)
    {
        require(isMember[delegator], "DAO: delegator not a member");
        require(delegateOf[delegator] == msg.sender, "DAO: not the delegate");
        _castVote(id, delegator, support);
    }

    /// Logic chung: mỗi địa chỉ chỉ được tính 1 phiếu cho mỗi Proposal,
    /// dù tự bỏ hay do người được ủy quyền bỏ thay.
    function _castVote(uint256 id, address voter, bool support) internal {
        require(!hasVoted[id][voter], "DAO: already voted");
        hasVoted[id][voter] = true;
        castBy[id][voter] = msg.sender;
        votedYes[id][voter] = support;
        if (support) proposals[id].yesVotes++;
        else proposals[id].noVotes++;
        emit Voted(id, voter, msg.sender, support);
    }

    /// Gỡ phiếu mà người được ủy quyền đã bỏ thay `voter`.
    function _removeVote(uint256 id, address voter) internal {
        if (votedYes[id][voter]) proposals[id].yesVotes--;
        else proposals[id].noVotes--;
        hasVoted[id][voter] = false;
        emit VoteRemoved(id, voter, castBy[id][voter]);
    }

    // ───────────── 4. Delegate ─────────────
    /// Ủy quyền (hoặc đổi người được ủy quyền) cho `to`.
    function delegate(address to) external onlyMember {
        require(to != msg.sender, "DAO: cannot delegate to self");
        require(isMember[to], "DAO: delegatee not a member");
        require(delegateOf[msg.sender] != to, "DAO: already delegated to this address");
        require(!_createsLoop(msg.sender, to), "DAO: delegation loop");
        _setDelegate(msg.sender, to);
    }

    /// Hủy ủy quyền để tự bỏ phiếu lại.
    function undelegate() external onlyMember {
        require(delegateOf[msg.sender] != address(0), "DAO: no delegate set");
        _setDelegate(msg.sender, address(0));
    }

    function _setDelegate(address from, address to) internal {
        delegateOf[from] = to;
        delegationHistory.push(DelegationRecord(from, to, block.timestamp));
        emit Delegated(from, to, block.timestamp);
    }

    /// Đi theo chuỗi ủy quyền bắt đầu từ `to`; nếu gặp lại `from` thì sẽ tạo vòng lặp.
    /// Chuỗi luôn hữu hạn vì hợp đồng không bao giờ cho phép vòng lặp tồn tại.
    function _createsLoop(address from, address to) internal view returns (bool) {
        address current = to;
        while (current != address(0)) {
            if (current == from) return true;
            current = delegateOf[current];
        }
        return false;
    }

    // ───────────── 6. Quản lý Proposal ─────────────
    function closeProposal(uint256 id) external onlyOwner proposalExists(id) onlyActive(id) {
        proposals[id].status = Status.Closed;
        emit ProposalClosed(id);
    }

    // ───────────── 5 & 7. View functions ─────────────
    function proposalCount() external view returns (uint256) {
        return proposals.length;
    }

    function getProposal(uint256 id) external view proposalExists(id) returns (Proposal memory) {
        return proposals[id];
    }

    function getAllProposals() external view returns (Proposal[] memory) {
        return proposals;
    }

    function getResult(uint256 id)
        external
        view
        proposalExists(id)
        returns (uint256 yesVotes, uint256 noVotes, bool isActive)
    {
        Proposal storage p = proposals[id];
        return (p.yesVotes, p.noVotes, p.status == Status.Active);
    }

    function getDelegationHistory() external view returns (DelegationRecord[] memory) {
        return delegationHistory;
    }
}
