class ServiceError(Exception):
    """A rule was broken. Routers never catch these; main.py turns them into
    a JSON response with the matching status code."""

    status_code = 400

    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


class BadRequest(ServiceError):
    status_code = 400


class Forbidden(ServiceError):
    status_code = 403


class NotFound(ServiceError):
    status_code = 404
