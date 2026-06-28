import { Module } from '@nestjs/common';
import { FamilyModule } from '../family/family.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [FamilyModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
