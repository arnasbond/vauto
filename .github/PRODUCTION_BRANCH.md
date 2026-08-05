# VAUTO GitHub Actions — production branch policy
#
# Canonical production branch: **master**
# Do not add `main` as a production deploy trigger.
# Ops-only workflows (workflow_dispatch) should checkout `ref: master`
# unless they intentionally target a specific commit SHA.
