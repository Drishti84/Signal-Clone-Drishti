from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./signal.db"
    cors_origins: str = "http://localhost:3000"
    seed_on_startup: bool = True
    default_country_code: str = "+91"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
