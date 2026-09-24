import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SignupDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Enter a valid work email address.' })
  email!: string;

  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters.' })
  @MaxLength(128, { message: 'Password must be 128 characters or fewer.' })
  password!: string;

  @IsString()
  @IsNotEmpty({ message: 'Enter your full name.' })
  @MaxLength(120, { message: 'Full name must be 120 characters or fewer.' })
  fullName!: string;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @Equals(true, {
    message: 'Please agree to the Terms of Service and Privacy Policy.',
  })
  acceptTerms!: boolean;
}
