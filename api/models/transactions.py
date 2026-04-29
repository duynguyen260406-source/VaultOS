from decimal import Decimal
from pydantic import BaseModel, Field, field_serializer, field_validator, model_validator
from typing import Optional


class DepositRequest(BaseModel):
    account_id: int
    amount: Decimal = Field(max_digits=18, decimal_places=2)

    @field_validator('amount')
    @classmethod
    def amount_positive(cls, v):
        if v <= 0:
            raise ValueError('amount must be greater than zero')
        return v


class WithdrawRequest(BaseModel):
    account_id: int
    amount: Decimal = Field(max_digits=18, decimal_places=2)

    @field_validator('amount')
    @classmethod
    def amount_positive(cls, v):
        if v <= 0:
            raise ValueError('amount must be greater than zero')
        return v


class TransferRequest(BaseModel):
    from_account_id: int
    to_account_id: int
    amount: Decimal = Field(max_digits=18, decimal_places=2)

    @field_validator('amount')
    @classmethod
    def amount_positive(cls, v):
        if v <= 0:
            raise ValueError('amount must be greater than zero')
        return v

    @model_validator(mode='after')
    def accounts_must_differ(self):
        if self.from_account_id == self.to_account_id:
            raise ValueError('from_account_id and to_account_id must be different')
        return self


class TransactionRecord(BaseModel):
    transaction_id: int
    transaction_type: str
    amount: Decimal
    transaction_date: str
    description: Optional[str] = None
    reference_id: Optional[int] = None

    @field_serializer('amount')
    def serialize_amount(self, value: Decimal):
        return float(value)


class TransactionResponse(BaseModel):
    success: bool
    message: str


class TransactionHistoryResponse(BaseModel):
    account_id: int
    transactions: list[TransactionRecord]
    total: int
