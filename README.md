# LockingContractExample

Locking contract requirements

[x]. You can create a single lock per account. When you create it, you must specify expiration time and amount of tokens
[x] You can increase amount of tokens under an active lock
[x] You can extend expiration time
[x] You can withdraw early as a partial amount with a linear penalty. Early withdrawal with partial amount does not affect expiration
[x] You can withdraw after expiration with no penalty.
[x] Locking duration is reflected as an exponential boost. This boost should be calculated as follows:
⁃ p = a \* t^1.2, where P = points, a = amount of tokens, t = time (months)
[x] The 1.2 parameter should be admin updatable.
[x] Deducted penalty should be split between to two addresses set at contract creation time

# Open Questions

- consider the case user locks at day 29 and is eligible for a month-worth of rewards
- owner holds the reward token
- FoT Tokens, xctd and rewards
