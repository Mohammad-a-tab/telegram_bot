import { IsUrl } from 'class-validator';

export class SetSubDto {
  @IsUrl({ require_tld: false })
  link: string;
}
