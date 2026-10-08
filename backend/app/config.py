from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./signal.db"
    cors_origins: str = "http://localhost:3000"
    seed_on_startup: bool = True
    default_country_code: str = "+91"
    # Optional pattern for extra allowed origins, e.g. preview deployments.
    cors_origin_regex: str | None = None

    @property
    def cors_origin_list(self) -> list[str]:
        # Browsers send origins without a trailing slash, so one typed into
        # the setting would never match.
        origins = (origin.strip().rstrip("/") for origin in self.cors_origins.split(","))
        return [origin for origin in origins if origin]


settings = Settings()
