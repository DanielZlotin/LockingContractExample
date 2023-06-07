# LockingContractExample

Locking contract requirements

1.  You can create a single lock per account. When you create it, you must specify expiration time and amount of tokens
2.  You can increase amount of tokens under an active lock
3.  You can extend expiration time
4.  You can withdraw early as a partial amount with a linear penalty. Early withdrawal with partial amount does not affect expiration
5.  You can withdraw after expiration with no penalty.
6.  Locking duration is reflected as an exponential boost. This boost should be calculated as follows:
    ⁃ p = a \* t^1.2, where P = points, a = amount of tokens, t = time (months)
7.  The 1.2 parameter should be admin updatable.
8.  Deducted penalty should be split between to two addresses set at contract creation time
