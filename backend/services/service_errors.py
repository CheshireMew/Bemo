class ServiceError(Exception):
    pass


class NotFoundError(ServiceError):
    pass


class ValidationError(ServiceError):
    pass


class UpstreamServiceError(ServiceError):
    pass
