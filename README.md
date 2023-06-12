# LockingContractExample

Locking contract requirements

[x]. You can create a single lock per account. When you create it, you must specify expiration time and amount of tokens
[] You can increase amount of tokens under an active lock
[] You can extend expiration time
[x] You can withdraw early as a partial amount with a linear penalty. Early withdrawal with partial amount does not affect expiration
[x] You can withdraw after expiration with no penalty.
[x] Locking duration is reflected as an exponential boost. This boost should be calculated as follows:
⁃ p = a \* t^1.2, where P = points, a = amount of tokens, t = time (months)
[x] The 1.2 parameter should be admin updatable.
[x] Deducted penalty should be split between to two addresses set at contract creation time
