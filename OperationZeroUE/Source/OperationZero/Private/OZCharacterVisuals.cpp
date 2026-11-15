#include "OZCharacter.h"
#include "OZShapes.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Engine/World.h"

using OZShapes::EShape;

namespace
{
	const FLinearColor Skin(0.45f, 0.26f, 0.17f), Black(0.02f, 0.02f, 0.02f), Metal(0.04f, 0.045f, 0.05f);
	FLinearColor TeamUniform(int32 Team) { return Team == 0 ? FLinearColor(0.07f, 0.1f, 0.05f) : FLinearColor(0.1f, 0.06f, 0.04f); }
	FLinearColor TeamGear(int32 Team) { return Team == 0 ? FLinearColor(0.045f, 0.06f, 0.035f) : FLinearColor(0.035f, 0.03f, 0.025f); }
	FLinearColor TeamVisor(int32 Team) { return Team == 0 ? FLinearColor(0.1f, 0.4f, 1.f) : FLinearColor(1.f, 0.15f, 0.08f); }

	USceneComponent* Joint(AActor* Owner, USceneComponent* Parent, const FVector& Loc, const TCHAR* Name)
	{
		USceneComponent* J = NewObject<USceneComponent>(Owner, MakeUniqueObjectName(Owner, USceneComponent::StaticClass(), FName(Name)));
		J->SetupAttachment(Parent);
		J->SetRelativeLocation(Loc);
		J->RegisterComponent();
		return J;
	}
}

// Corpo em 3ª pessoa montado com formas básicas (convenção: X = frente, Z = cima).
void AOZCharacter::BuildBody()
{
	const FLinearColor U = TeamUniform(Team), G = TeamGear(Team), V = TeamVisor(Team);
	auto Part = [this](USceneComponent* P, EShape S, const FVector& Size, const FVector& Loc, const FLinearColor& C, const FRotator& R = FRotator::ZeroRotator) {
		UStaticMeshComponent* M = OZShapes::AddPart(this, P, S, Size, Loc, C, R);
		M->SetOwnerNoSee(true); // o próprio jogador não vê o corpo (usa a arma em 1ª pessoa)
		BodyParts.Add(M);
		return M;
	};
	BodyRoot = Joint(this, GetCapsuleComponent(), FVector(0, 0, -StandHalfOffset()), TEXT("BodyRoot"));
	Hips = Joint(this, BodyRoot, FVector(0, 0, 92), TEXT("Hips"));
	Part(Hips, EShape::Cube, FVector(26, 38, 20), FVector::ZeroVector, U);
	Part(Hips, EShape::Cube, FVector(28, 42, 6), FVector(0, 0, 6), Black);
	Spine = Joint(this, Hips, FVector(0, 0, 8), TEXT("Spine"));
	Part(Spine, EShape::Cylinder, FVector(34, 44, 58), FVector(0, 0, 30), U);
	Part(Spine, EShape::Cube, FVector(30, 46, 40), FVector(1, 0, 34), G);
	for (int32 i = -1; i <= 1; i++) Part(Spine, EShape::Cube, FVector(6, 10, 11), FVector(17, i * 13.f, 24), G * 0.8f);
	Part(Spine, EShape::Cube, FVector(17, 34, 38), FVector(-23, 0, 36), G * 0.8f);
	Part(Spine, EShape::Cylinder, FVector(1.6f, 1.6f, 45), FVector(-25, 12, 72), Black);
	Neck = Joint(this, Spine, FVector(0, 0, 64), TEXT("Neck"));
	Part(Neck, EShape::Sphere, FVector(24, 21, 26), FVector(0, 0, 11), Skin);
	Part(Neck, EShape::Sphere, FVector(32, 30, 22), FVector(-1, 0, 17), G * 1.2f);
	Part(Neck, EShape::Cube, FVector(5, 20, 5), FVector(12, 0, 20), Black);
	Part(Neck, EShape::Cube, FVector(2, 17, 4), FVector(11.5f, 0, 11), V);
	auto Leg = [&](float Side, USceneComponent** Out, const TCHAR* N1, const TCHAR* N2) {
		Out[0] = Joint(this, Hips, FVector(0, Side * 11.f, -5), N1);
		Part(Out[0], EShape::Cylinder, FVector(17, 17, 46), FVector(0, 0, -23), U);
		Out[1] = Joint(this, Out[0], FVector(0, 0, -44), N2);
		Part(Out[1], EShape::Cylinder, FVector(15, 15, 44), FVector(0, 0, -22), U);
		Part(Out[1], EShape::Cube, FVector(6, 12, 10), FVector(7, 0, -2), G);
		Part(Out[1], EShape::Cube, FVector(27, 15, 11), FVector(5, 0, -44), Black);
	};
	Leg(-1.f, LegL, TEXT("HipL"), TEXT("KneeL"));
	Leg(1.f, LegR, TEXT("HipR"), TEXT("KneeR"));
	auto Arm = [&](float Side, USceneComponent** Out, const TCHAR* N1, const TCHAR* N2) {
		Out[0] = Joint(this, Spine, FVector(0, Side * 30.f, 56), N1);
		Part(Out[0], EShape::Cylinder, FVector(13, 13, 32), FVector(0, 0, -16), U);
		Part(Out[0], EShape::Sphere, FVector(16, 16, 12), FVector(0, 0, -2), G);
		Out[1] = Joint(this, Out[0], FVector(0, 0, -32), N2);
		Part(Out[1], EShape::Cylinder, FVector(11, 11, 30), FVector(0, 0, -15), U);
		Part(Out[1], EShape::Sphere, FVector(11, 11, 13), FVector(0, 0, -31), Black);
	};
	Arm(-1.f, ArmL, TEXT("ShoulderL"), TEXT("ElbowL"));
	Arm(1.f, ArmR, TEXT("ShoulderR"), TEXT("ElbowR"));
	// fuzil nas mãos
	GunPivot = Joint(this, Spine, FVector(30, 10, 42), TEXT("GunPivot"));
	const float L = CurrentWeapon().Stats.Length;
	Part(GunPivot, EShape::Cube, FVector(L * 0.55f, 6, 10), FVector(L * 0.18f, 0, 0), Metal);
	Part(GunPivot, EShape::Cylinder, FVector(2.8f, 2.8f, L * 0.45f), FVector(L * 0.62f, 0, 1.5f), Black, FRotator(-90, 0, 0));
	Part(GunPivot, EShape::Cube, FVector(7, 4, 16), FVector(L * 0.2f, 0, -10), Black);
	Part(GunPivot, EShape::Cube, FVector(22, 5, 9), FVector(-12, 0, -1), Metal);
	BodyMuzzle = Joint(this, GunPivot, FVector(L * 0.85f, 0, 1.5f), TEXT("BodyMuzzle"));
	if (IsPlayerControlled()) BuildViewmodel();
}

float AOZCharacter::StandHalfOffset() const { return GetCapsuleComponent()->GetUnscaledCapsuleHalfHeight(); }

void AOZCharacter::SetTeamColors()
{
	if (!BodyParts.Num()) return;
	// recria o corpo com as cores da equipe
	for (UStaticMeshComponent* P : BodyParts) if (P) P->DestroyComponent();
	BodyParts.Reset();
	if (BodyRoot) BodyRoot->DestroyComponent();
	BuildBody();
}

// Arma em 1ª pessoa presa à câmera; só o dono enxerga.
void AOZCharacter::BuildViewmodel()
{
	for (UStaticMeshComponent* P : ViewParts) if (P) P->DestroyComponent();
	ViewParts.Reset();
	if (!ViewRoot) { ViewRoot = Joint(this, Camera, FVector::ZeroVector, TEXT("ViewRoot")); }
	const FOZWeaponStats& S = CurrentWeapon().Stats;
	ViewWeaponId = S.Id;
	auto Part = [this](EShape Sh, const FVector& Size, const FVector& Loc, const FLinearColor& C, const FRotator& R = FRotator::ZeroRotator) {
		UStaticMeshComponent* M = OZShapes::AddPart(this, ViewRoot, Sh, Size, Loc, C, R, false);
		M->SetOnlyOwnerSee(true);
		ViewParts.Add(M);
		return M;
	};
	const FLinearColor Body = S.Color, Dark = Black, Furn = S.Color * 0.7f;
	const float L = S.Length, H = S.Class == EOZWeaponClass::Pistol ? 12.f : 14.f;
	if (S.IsMelee())
	{
		Part(EShape::Cube, FVector(12, 3, 4), FVector(0, 0, -2), Dark);
		Part(EShape::Cube, FVector(20, 0.8f, 3.5f), FVector(16, 0, 0), FLinearColor(0.6f, 0.6f, 0.62f));
	}
	else
	{
		Part(EShape::Cube, FVector(L * 0.55f, 5.5f, H * 0.6f), FVector(L * 0.2f, 0, 0), Body);                       // receptor
		Part(EShape::Cylinder, FVector(2.6f, 2.6f, L * 0.5f), FVector(L * 0.62f, 0, H * 0.05f), Dark, FRotator(-90, 0, 0)); // cano
		Part(EShape::Cube, FVector(L * 0.28f, 6.f, H * 0.5f), FVector(L * 0.55f, 0, -0.5f), Furn);                    // guarda-mão
		Part(EShape::Cube, FVector(L * 0.42f, 3.f, 1.2f), FVector(L * 0.3f, 0, H * 0.31f), Dark);                       // trilho
		Part(EShape::Cube, FVector(7, 4, H * 0.8f), FVector(L * 0.22f, 0, -H * 0.6f), Dark, FRotator(0, 0, 0));        // carregador
		Part(EShape::Cube, FVector(5, 4, H * 0.7f), FVector(-2, 0, -H * 0.5f), Dark, FRotator(-15, 0, 0));             // empunhadura
		if (S.Class != EOZWeaponClass::Pistol) Part(EShape::Cube, FVector(L * 0.3f, 5.f, H * 0.7f), FVector(-L * 0.2f, 0, -H * 0.12f), Furn); // coronha
		Part(EShape::Cylinder, FVector(3.2f, 3.2f, 4.f), FVector(L * 0.89f, 0, H * 0.05f), Dark, FRotator(-90, 0, 0)); // quebra-chamas
		if (S.bScope) Part(EShape::Cylinder, FVector(4.5f, 4.5f, 26), FVector(L * 0.18f, 0, H * 0.35f + 4.f), Dark, FRotator(-90, 0, 0));
		else Part(EShape::Cube, FVector(1, 1, 2), FVector(L * 0.75f, 0, H * 0.4f), Dark);
	}
	// braços (luvas + mangas)
	const FLinearColor Sleeve = TeamUniform(Team);
	Part(EShape::Cylinder, FVector(8, 8, 32), FVector(-16, 1, -6), Sleeve, FRotator(-90, 0, 0));
	Part(EShape::Sphere, FVector(9, 8, 11), FVector(0, 1, -4), Dark);
	if (S.Class != EOZWeaponClass::Pistol && !S.IsMelee())
	{
		Part(EShape::Cylinder, FVector(8, 8, 32), FVector(L * 0.4f, -12, -9), Sleeve, FRotator(-70, 20, 0));
		Part(EShape::Sphere, FVector(9, 8, 11), FVector(L * 0.55f, -2, -4), Dark);
	}
	ViewMuzzle = Joint(this, ViewRoot, FVector(S.IsMelee() ? 25.f : L * 0.92f, 0, H * 0.05f), TEXT("ViewMuzzle"));
}

// Animação procedural do corpo (andar, correr, agachar, mirar, morrer).
void AOZCharacter::AnimateBody(float Dt)
{
	if (!BodyRoot) return;
	if (!bAlive)
	{
		const float K = FMath::Min(1.f, DeathTime / 0.55f);
		BodyRoot->SetRelativeRotation(FRotator(-88.f * K * K, 0, 0));
		return;
	}
	const float Speed = GetVelocity().Size2D();
	const float CrouchK = bIsCrouched ? 1.f : 0.f;
	WalkPhase += Dt * (2.f + Speed / 100.f * 1.6f);
	const float Sw = FMath::Min(1.f, Speed / 450.f), S = FMath::Sin(WalkPhase), C = FMath::Cos(WalkPhase);
	const float Amp = 40.f * Sw;
	const bool bAir = !GetCharacterMovement()->IsMovingOnGround();
	LegL[0]->SetRelativeRotation(FRotator(bAir ? 40.f : S * Amp + CrouchK * 72.f, 0, 0));
	LegR[0]->SetRelativeRotation(FRotator(bAir ? 6.f : -S * Amp + CrouchK * 72.f, 0, 0));
	LegL[1]->SetRelativeRotation(FRotator(bAir ? -63.f : -(FMath::Max(0.f, C) * Amp * 1.3f + CrouchK * 120.f), 0, 0));
	LegR[1]->SetRelativeRotation(FRotator(bAir ? -28.f : -(FMath::Max(0.f, -C) * Amp * 1.3f + CrouchK * 120.f), 0, 0));
	// BodyRoot fica sempre nos pés; ao agachar, o quadril desce com as pernas dobradas
	Hips->SetRelativeLocation(FVector(0, 0, 92.f - CrouchK * 36.f + FMath::Abs(S) * 4.f * Sw));
	BodyRoot->SetRelativeLocation(FVector(0, 0, -GetCapsuleComponent()->GetScaledCapsuleHalfHeight()));
	const float AimPitch = Controller ? FRotator::NormalizeAxis(Controller->GetControlRotation().Pitch) : 0.f;
	const float Lean = (Speed > 600.f ? 16.f : 3.f) + CrouchK * 10.f;
	Spine->SetRelativeRotation(FRotator(AimPitch * 0.45f - Lean, 0, 0));
	Neck->SetRelativeRotation(FRotator(AimPitch * 0.45f + Lean * 0.7f, 0, 0));
	const float Aim = AimPitch * 0.45f + Lean;
	const float Lower = (Speed > 600.f && AdsAlpha < 0.5f) ? 32.f : 0.f;
	ArmR[0]->SetRelativeRotation(FRotator(70.f + Aim - Lower, 0, -14.f));
	ArmR[1]->SetRelativeRotation(FRotator(28.f, 0, 0));
	ArmL[0]->SetRelativeRotation(FRotator(82.f + Aim - Lower, 0, 36.f));
	ArmL[1]->SetRelativeRotation(FRotator(9.f, 0, 0));
	GunPivot->SetRelativeRotation(FRotator(Aim - Lower, 0, 0));
}

// Balanço, passos, mira, recuo, recarga e afastamento de paredes.
void AOZCharacter::AnimateViewmodel(float Dt)
{
	if (!ViewRoot) return;
	if (ViewWeaponId != CurrentWeapon().Stats.Id) BuildViewmodel();
	const FOZWeaponState& W = CurrentWeapon();
	const float Speed = GetVelocity().Size2D();
	static float Bob = 0.f;
	Bob += Dt * Speed / 100.f * (IsSprinting() ? 1.6f : 1.9f);
	const float BobAmp = (IsSprinting() ? 2.2f : 1.f) * FMath::Min(1.f, Speed / 400.f) * (1.f - AdsAlpha * 0.85f);
	Kick = FMath::Max(0.f, Kick - Dt * 12.f);
	const FVector Rest(30.f, 16.f, -16.f), Ads(26.f, 0.f, -(W.Stats.Class == EOZWeaponClass::Pistol ? 6.f : 7.5f));
	FVector P = FMath::Lerp(Rest, Ads, AdsAlpha);
	P.Y += FMath::Sin(Bob) * BobAmp; P.Z -= FMath::Abs(FMath::Cos(Bob)) * BobAmp;
	P.X -= Kick * (5.f - AdsAlpha * 2.f);
	if (IsSprinting()) { P.Y -= 6.f; P.Z -= 4.f; }
	if (SwitchTime > 0.f) P.Z -= SwitchTime / 0.45f * 30.f;
	float RollR = 0.f, PitchR = Kick * (W.Stats.RecoilVert * 2.f + 2.f) * (1.f - AdsAlpha * 0.5f);
	if (W.Reloading > 0.f)
	{
		const float T = 1.f - W.Reloading / FMath::Max(0.01f, W.ReloadTotal);
		const float K = FMath::Sin(FMath::Min(1.f, T) * UE_PI);
		P.Z -= K * 8.f; P.Y -= K * 3.f; RollR = K * 25.f; PitchR += K * 15.f;
	}
	// afasta a arma de paredes próximas (evita atravessar)
	FHitResult Hit;
	FCollisionQueryParams Q(SCENE_QUERY_STAT(OZVM), false, this);
	const FVector CamLoc = Camera->GetComponentLocation();
	if (GetWorld()->LineTraceSingleByChannel(Hit, CamLoc, CamLoc + Camera->GetForwardVector() * 90.f, ECC_Visibility, Q))
	{
		const float Pull = 90.f - Hit.Distance;
		P.X -= Pull * 0.6f; PitchR -= Pull * 0.4f;
	}
	ViewRoot->SetRelativeLocation(P);
	ViewRoot->SetRelativeRotation(FRotator(PitchR, IsSprinting() ? -35.f : 0.f, RollR + (IsSprinting() ? 12.f : 0.f)));
	// luneta: esconde a arma quando a mira está totalmente aberta
	ViewRoot->SetVisibility(!(W.Stats.bScope && AdsAlpha > 0.92f), true);
}
