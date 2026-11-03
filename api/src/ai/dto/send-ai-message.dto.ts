import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SendAiMessageDto {
  /** Client-generated UUID; retries with the same id reuse one reservation. */
  @IsUUID()
  clientRequestId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content!: string;
}
