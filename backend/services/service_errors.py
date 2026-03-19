class ServiceError(Exception):
    pass


class NotFoundError(ServiceError):
    pass


class ValidationError(ServiceError):
    pass


class UpstreamServiceError(ServiceError):
    pass


def to_status_code(error: ServiceError) -> int:
    if isinstance(error, NotFoundError):
        return 404
    if isinstance(error, ValidationError):
        return 400
    if isinstance(error, UpstreamServiceError):
        return 502
    return 500
