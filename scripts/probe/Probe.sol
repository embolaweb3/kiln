// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20Like {
    function approve(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function allowance(address, address) external view returns (uint256);
    function balanceOf(address) external view returns (uint256);
    function permit(address, address, uint256, uint256, uint8, bytes32, bytes32) external;
}

// Stands in for a Kiln bond/sale contract: pulls tokens it was approved for.
contract Spender {
    function pull(IERC20Like t, address from, address to, uint256 amt) external returns (bool) {
        return t.transferFrom(from, to, amt);
    }
}

// Stands in for the token owner (a contract holding MEZO).
contract Owner {
    function run(IERC20Like t, Spender s, address to, uint256 amt)
        external
        returns (uint256 allowAfterApprove, uint256 ownerBal, uint256 toBal, uint256 allowAfterPull)
    {
        t.approve(address(s), amt);
        allowAfterApprove = t.allowance(address(this), address(s));
        s.pull(t, address(this), to, amt);
        ownerBal = t.balanceOf(address(this));
        toBal = t.balanceOf(to);
        allowAfterPull = t.allowance(address(this), address(s));
    }
}

// Third party relays a permit signed by an EOA, then the contract spender pulls.
contract PermitRelay {
    function run(IERC20Like t, Spender s, address owner, address to, uint256 amt, uint256 dl, uint8 v, bytes32 r, bytes32 sg)
        external
        returns (uint256 allowAfterPermit, uint256 toBal)
    {
        t.permit(owner, address(s), amt, dl, v, r, sg);
        allowAfterPermit = t.allowance(owner, address(s));
        s.pull(t, owner, to, amt);
        toBal = t.balanceOf(to);
    }
}
