# Web release freeze

At the owner's request on 2026-09-10, the web game is rolled back to the last
successful Pages release before the new character redesign:
`e471b964eb28db5b13938e4352e602a2b4c06258`.

Do not deploy future native/game changes to the web unless explicitly requested.
Pages has no push trigger. The manual workflow is pinned to the historical web
revision; its service-worker cache key is changed only to activate the rollback.
The current iOS/native source and phone installation are not reverted.
