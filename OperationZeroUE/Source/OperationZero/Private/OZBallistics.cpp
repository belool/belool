#include "OZBallistics.h"
#include "OZCharacter.h"
#include "OZBlock.h"
#include "OZEffects.h"
#include "OZSound.h"
#include "OZGameMode.h"
#include "Engine/World.h"
#include "Components/PrimitiveComponent.h"

static const float Gravity = 981.f;

void UOZBallistics::Fire(AOZCharacter* Shooter, const FVector& Origin, const FVector& Dir, const FOZWeaponStats& Stats, bool bTracer)
{
	FOZProjectile P;
	P.Pos = Origin; P.Vel = Dir * Stats.Velocity; P.Power = P.Power0 = Stats.Penetration;
	P.Stats = Stats; P.Shooter = Shooter; P.bTracer = bTracer;
	Projectiles.Add(MoveTemp(P));
}

void UOZBallistics::Tick(float Dt)
{
	AOZEffects* FX = AOZEffects::Get(this);
	for (int32 i = Projectiles.Num() - 1; i >= 0; i--)
	{
		FOZProjectile& P = Projectiles[i];
		P.Life -= Dt;
		P.Vel.Z -= Gravity * Dt;
		const float Step = P.Vel.Size() * Dt;
		const FVector Dir = P.Vel.GetSafeNormal();
		const FVector From = P.Pos;
		const bool bAlive = Segment(P, From, Dir, Step);
		if (!bAlive || P.Life <= 0.f || P.Traveled > 120000.f) { Projectiles.RemoveAtSwap(i); continue; }
		P.Pos = From + Dir * Step;
		P.Traveled += Step;
		if (P.bTracer && FX && P.Traveled > 300.f) FX->Tracer(P.Pos - Dir * FMath::Min(Step, 600.f), P.Pos);
	}
}

bool UOZBallistics::Segment(FOZProjectile& P, const FVector& From, const FVector& Dir, float Len)
{
	UWorld* W = GetWorld();
	AOZEffects* FX = AOZEffects::Get(this);
	FVector O = From;
	float Remaining = Len;
	for (int32 Guard = 0; Guard < 6 && Remaining > 0.f; Guard++)
	{
		// 1) mundo
		FHitResult Hit;
		FCollisionQueryParams Q(SCENE_QUERY_STAT(OZBullet), true);
		if (P.Shooter.IsValid()) Q.AddIgnoredActor(P.Shooter.Get());
		const bool bWorld = W->LineTraceSingleByChannel(Hit, O, O + Dir * Remaining, ECC_Visibility, Q);
		const float TWorld = bWorld ? Hit.Distance : Remaining;
		// 2) personagens (caixas de acerto) antes do obstáculo
		AOZCharacter* Best = nullptr; float BestT = TWorld; EOZHitRegion BestR = EOZHitRegion::Chest;
		for (AOZCharacter* C : AOZGameMode::Characters(this))
		{
			if (!C->bAlive || C == P.Shooter.Get() || P.Hit.Contains(C)) continue;
			const FVector To = C->GetActorLocation() - O;
			const float Along = FVector::DotProduct(To, Dir);
			if (Along < -200.f || Along > TWorld + 200.f) continue;
			const float Perp = (To - Dir * Along).Size();
			if (Perp > 250.f) continue;
			// passou perto de um inimigo: supressão
			if (Perp < 220.f && P.Shooter.IsValid() && C->Team != P.Shooter->Team && !P.Near.Contains(C)) { P.Near.Add(C); C->OnNearMiss(P.Shooter.Get()); }
			float T; EOZHitRegion R;
			if (C->RayHit(O, Dir, BestT, T, R) && T < BestT) { Best = C; BestT = T; BestR = R; }
		}
		if (Best)
		{
			const FVector Pt = O + Dir * BestT;
			P.Hit.Add(Best);
			const float Ratio = FMath::Max(0.25f, P.Power / P.Power0);
			const float Dmg = OZWeapons::DamageAtRange(P.Stats, P.Traveled + BestT) * Ratio * OZWeapons::RegionMultiplier(P.Stats, BestR);
			Best->ApplyHit(Dmg, BestR, P.Shooter.Get(), Dir, P.Stats.Id, false, (P.Traveled + BestT));
			if (FX) FX->Blood(Pt, Dir, BestR == EOZHitRegion::Head ? 2.f : 1.f);
			P.Power -= 14.f;
			if (P.Power <= 4.f) return false;
			const float Adv = BestT + 1.f;
			O += Dir * Adv; Remaining -= Adv;
			continue;
		}
		if (!bWorld) return true;
		// 3) impacto no mundo + penetração
		UPrimitiveComponent* Comp = Hit.GetComponent();
		FName Mat = "concrete";
		if (Comp && Comp->ComponentTags.Num()) Mat = Comp->ComponentTags[0];
		if (FX) FX->Impact(Hit.ImpactPoint, Hit.ImpactNormal, Mat);
		OZSound::Play(this, OZSound::EKind::Impact, Hit.ImpactPoint, Mat == "metal" || Mat == "sheetmetal" ? 2.2f : 1.f, 0.5f);
		if (FMath::FRand() < 0.3f) AOZGameMode::ReportNoise(this, Hit.ImpactPoint, 1000.f, P.Shooter.Get());
		if (AOZBlock* B = Cast<AOZBlock>(Hit.GetActor())) B->TakeHit(OZWeapons::DamageAtRange(P.Stats, P.Traveled) * 0.6f, false, P.Shooter.Get());
		// espessura: traço de volta a partir de 1 m adiante, só contra este componente
		float Thick = 1000.f;
		FVector Exit = Hit.ImpactPoint;
		if (Comp)
		{
			FHitResult Back;
			const FVector Far = Hit.ImpactPoint + Dir * 100.f;
			if (Comp->LineTraceComponent(Back, Far, Hit.ImpactPoint - Dir * 0.5f, FCollisionQueryParams(SCENE_QUERY_STAT(OZBack), true)))
			{
				Exit = Back.ImpactPoint;
				Thick = FVector::Dist(Hit.ImpactPoint, Exit);
			}
		}
		const float Cost = OZMaterials::Density(Mat) * Thick; // densidade por cm
		if (Cost > P.Power) return false;
		P.Power -= Cost;
		P.Vel *= 0.85f;
		if (FX) FX->Impact(Exit, Dir, Mat);
		const float Adv = Hit.Distance + Thick + 1.f;
		O += Dir * Adv; Remaining -= Adv;
	}
	return true;
}
