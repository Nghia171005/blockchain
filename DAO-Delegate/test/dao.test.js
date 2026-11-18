const DAO = artifacts.require("DAO");

// Kiểm tra giao dịch bị revert và thông báo lỗi chứa `reason`.
async function expectRevert(promise, reason) {
  try {
    await promise;
  } catch (err) {
    assert(err.message.includes(reason), `Sai lý do revert: ${err.message}`);
    return;
  }
  assert.fail(`Đáng lẽ phải revert với "${reason}"`);
}

contract("DAO", (accounts) => {
  const [owner, alice, bob, carol, outsider] = accounts;
  let dao;

  // Mỗi test chạy trên một hợp đồng mới để không ảnh hưởng lẫn nhau.
  beforeEach(async () => {
    dao = await DAO.new({ from: owner });
    for (const m of [alice, bob, carol]) await dao.addMember(m, { from: owner });
    await dao.createProposal("Tang quy", "Tang quy hoat dong 10%", { from: alice });
  });

  describe("Thành viên", () => {
    it("owner thêm thành viên", async () => {
      assert.isTrue(await dao.isMember(alice));
      assert.equal((await dao.memberCount()).toString(), "4"); // owner + 3
    });

    it("không phải owner thì không thêm được", async () => {
      await expectRevert(dao.addMember(outsider, { from: alice }), "revert"); // OZ5 dùng custom error, Truffle không giải mã được tên lỗi
    });

    it("owner xóa thành viên", async () => {
      await dao.removeMember(carol, { from: owner });
      assert.isFalse(await dao.isMember(carol));
    });

    it("người ngoài không tạo được proposal", async () => {
      await expectRevert(dao.createProposal("x", "y", { from: outsider }), "not a member");
    });
  });

  describe("Proposal & Vote", () => {
    it("tạo proposal", async () => {
      const p = await dao.getProposal(0);
      assert.equal(p.title, "Tang quy");
      assert.equal(p.status, "0"); // Active
      assert.equal((await dao.proposalCount()).toString(), "1");
    });

    it("vote YES", async () => {
      await dao.vote(0, true, { from: bob });
      const r = await dao.getResult(0);
      assert.equal(r.yesVotes.toString(), "1");
      assert.equal(r.noVotes.toString(), "0");
      assert.isTrue(r.isActive);
    });

    it("vote NO", async () => {
      await dao.vote(0, false, { from: bob });
      assert.equal((await dao.getResult(0)).noVotes.toString(), "1");
    });

    it("không được vote 2 lần", async () => {
      await dao.vote(0, true, { from: bob });
      await expectRevert(dao.vote(0, false, { from: bob }), "already voted");
    });
  });

  describe("Delegate", () => {
    it("delegate và người được ủy quyền vote thay", async () => {
      await dao.delegate(bob, { from: alice });
      assert.equal(await dao.delegateOf(alice), bob);

      // alice đã ủy quyền nên không tự vote được
      await expectRevert(dao.vote(0, true, { from: alice }), "voting power delegated");

      await dao.voteOnBehalf(0, alice, true, { from: bob });
      await dao.vote(0, true, { from: bob }); // bob vẫn có phiếu của riêng mình
      assert.equal((await dao.getResult(0)).yesVotes.toString(), "2");

      // không vote thay alice lần 2 được
      await expectRevert(dao.voteOnBehalf(0, alice, false, { from: bob }), "already voted");
    });

    it("đổi delegate", async () => {
      await dao.delegate(bob, { from: alice });
      await dao.delegate(carol, { from: alice });
      assert.equal(await dao.delegateOf(alice), carol);
      await expectRevert(dao.voteOnBehalf(0, alice, true, { from: bob }), "not the delegate");
    });

    it("không delegate cho chính mình", async () => {
      await expectRevert(dao.delegate(alice, { from: alice }), "cannot delegate to self");
    });

    it("không delegate cho người ngoài", async () => {
      await expectRevert(dao.delegate(outsider, { from: alice }), "delegatee not a member");
    });

    it("không tạo vòng lặp (A->B, B->C, C->A bị chặn)", async () => {
      await dao.delegate(bob, { from: alice });
      await dao.delegate(carol, { from: bob });
      await expectRevert(dao.delegate(alice, { from: carol }), "delegation loop");
      await expectRevert(dao.delegate(alice, { from: bob }), "delegation loop");
    });

    it("hủy ủy quyền rồi tự vote", async () => {
      await dao.delegate(bob, { from: alice });
      await dao.undelegate({ from: alice });
      await dao.vote(0, false, { from: alice });
      assert.equal((await dao.getResult(0)).noVotes.toString(), "1");
    });

    it("hủy ủy quyền rồi tự vote đè lên phiếu đã được vote thay", async () => {
      await dao.delegate(bob, { from: alice });
      await dao.voteOnBehalf(0, alice, true, { from: bob }); // bob vote YES thay alice
      await dao.undelegate({ from: alice });

      await dao.vote(0, false, { from: alice }); // alice tự vote NO -> gỡ YES cũ
      const r = await dao.getResult(0);
      assert.equal(r.yesVotes.toString(), "0");
      assert.equal(r.noVotes.toString(), "1");
      assert.equal(await dao.castBy(0, alice), alice);

      // phiếu tự bỏ thì không thay được nữa
      await expectRevert(dao.vote(0, true, { from: alice }), "already voted");
    });

    it("xem lịch sử delegate", async () => {
      await dao.delegate(bob, { from: alice });
      await dao.delegate(carol, { from: alice });
      await dao.undelegate({ from: alice });
      const h = await dao.getDelegationHistory();
      assert.equal(h.length, 3);
      assert.equal(h[0].delegator, alice);
      assert.equal(h[0].delegatee, bob);
      assert.equal(h[1].delegatee, carol);
      assert.equal(h[2].delegatee, "0x0000000000000000000000000000000000000000");
      assert(Number(h[0].timestamp) > 0);
    });
  });

  describe("Đóng Proposal", () => {
    it("owner đóng proposal", async () => {
      await dao.closeProposal(0, { from: owner });
      assert.isFalse((await dao.getResult(0)).isActive);
    });

    it("không phải owner thì không đóng được", async () => {
      await expectRevert(dao.closeProposal(0, { from: alice }), "revert"); // OZ5 dùng custom error, Truffle không giải mã được tên lỗi
    });

    it("không vote được sau khi đóng", async () => {
      await dao.closeProposal(0, { from: owner });
      await expectRevert(dao.vote(0, true, { from: bob }), "proposal closed");
      await dao.delegate(bob, { from: alice });
      await expectRevert(dao.voteOnBehalf(0, alice, true, { from: bob }), "proposal closed");
    });
  });
});
