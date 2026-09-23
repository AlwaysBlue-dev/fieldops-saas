import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateSkillDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}

export class AssignSkillDto {
  @IsUUID()
  skillId!: string;
}
