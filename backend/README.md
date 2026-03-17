# Backend

## Run Tests

Use the unified test entrypoint from the `backend` directory:

```powershell
python run_tests.py
```

This runs both:

- service-level tests under [tests](/E:/Work/Code/Bemo/backend/tests)
- API-level tests using `fastapi.testclient`

The tests isolate data by setting `BEMO_DATA_DIR` to a per-test directory under `backend/tests/.tmp`, so they do not touch the real note data.

## Direct Command

If you want the raw discovery command instead, this is equivalent:

```powershell
python -m unittest discover -s tests
```
