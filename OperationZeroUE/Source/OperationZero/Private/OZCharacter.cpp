#include "OZCharacter.h"
#include "OZShapes.h"
#include "OZSound.h"
#include "OZEffects.h"
#include "OZBallistics.h"
#include "OZGrenade.h"
#include "OZGameMode.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"
#include "NavigationInvokerComponent.h"
#include "Engine/World.h"
#include "Engine/LocalPlayer.h"

namespace
{
	constexpr float StandHalf = 90.f, CrouchHalf = 60.f;
	constexpr float WalkSpeed = 460.f, SprintSpeed = 700.f, CrouchSpeed = 240.f;

	bool RaySphere(const FVector& O, const FVector& D, const FVector& C, float R, float MaxT, float& T)
	{
		const FVector L = O - C;
		const float B = FVector::DotProduct(L, D);
		const float Cc = L.SizeSquared() - R * R;
		const float Disc = B * B - Cc;
		if (Disc < 0.f) return false;
		const float S = FMath::Sqrt(Disc);
		T = -B - S;
		if (T < 0.f) T = -B + S;
		return T >= 0.f && T <= MaxT;
	}
	bool RayBox(const FVector& O, const FVector& D, const FVector& Min, const FVector& Max, float MaxT, float& T)
	{
		float T0 = 0.f, T1 = MaxT;
		for (int32 i = 0; i < 3; i++)
		{
			if (FMath::Abs(D[i]) < 1e-6f) { if (O[i] < Min[i] || O[i] > Max[i]) return false; continue; }
			float A = (Min[i] - O[i]) / D[i], B = (Max[i] - O[i]) / D[i];
			if (A > B) Swap(A, B);
			T0 = FMath::Max(T0, A); T1 = FMath::Min(T1, B);
			if (T0 > T1) return false;
		}
		T = T0;
		return true;
	}
}

AOZCharacter::AOZCharacter()
{
	PrimaryActorTick.bCanEverTick = true;
	GetCapsuleComponent()->InitCapsuleSize(35.f, StandHalf);
	// projéteis usam caixas de acerto próprias; a cápsula não bloqueia traços de visibilidade
	GetCapsuleComponent()->SetCollisionResponseToChannel(ECC_Visibility, ECR_Ignore);
	GetCapsuleComponent()->SetCollisionResponseToChannel(ECC_Camera, ECR_Ignore);
	GetMesh()->SetVisibility(false);

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(GetCapsuleComponent());
	Camera->SetRelativeLocation(FVector(0.f, 0.f, 72.f));
	Camera->bUsePawnControlRotation = true;
	Camera->SetFieldOfView(BaseFOV);

	NavInvoker = CreateDefaultSubobject<UNavigationInvokerComponent>(TEXT("NavInvoker"));
	NavInvoker->SetGenerationRadii(4000.f, 6000.f);

	bUseControllerRotationYaw = true;
	BaseEyeHeight = 72.f;
	CrouchedEyeHeight = 40.f;
	UCharacterMovementComponent* M = GetCharacterMovement();
	M->MaxWalkSpeed = WalkSpeed;
	M->MaxWalkSpeedCrouched = CrouchSpeed;
	M->NavAgentProps.bCanCrouch = true;
	M->SetCrouchedHalfHeight(CrouchHalf);
	M->JumpZVelocity = 600.f;
	M->GravityScale = 1.6f;
	M->AirControl = 0.3f;
	M->MaxStepHeight = 45.f;
	M->BrakingDecelerationWalking = 2400.f;
	M->GroundFriction = 9.f;
	M->bOrientRotationToMovement = false;
	M->bUseControllerDesiredRotation = false;
	AutoPossessAI = EAutoPossessAI::PlacedInWorldOrSpawned;
}

void AOZCharacter::BeginPlay()
{
	Super::BeginPlay();
	if (Weapons.Num() == 0) SetLoadout("ar4", "p9");
	BuildBody();
}

void AOZCharacter::PossessedBy(AController* NewController)
{
	Super::PossessedBy(NewController);
	SetTeamColors();
}

bool AOZCharacter::IsBot() const { return !IsPlayerControlled(); }

void AOZCharacter::SetLoadout(FName Primary, FName Secondary)
{
	Weapons.Reset();
	FOZWeaponState A; A.Init(OZWeapons::Get(Primary)); Weapons.Add(A);
	FOZWeaponState B; B.Init(OZWeapons::Get(Secondary)); Weapons.Add(B);
	Slot = 0;
	ViewWeaponId = NAME_None;
}

const FOZWeaponState& AOZCharacter::CurrentWeapon() const { return Weapons[FMath::Clamp(Slot, 0, Weapons.Num() - 1)]; }
FOZWeaponState& AOZCharacter::CurrentWeaponMutable() { return Weapons[FMath::Clamp(Slot, 0, Weapons.Num() - 1)]; }

FVector AOZCharacter::EyeLocation() const
{
	return IsPlayerControlled() ? Camera->GetComponentLocation() : GetActorLocation() + FVector(0, 0, GetCapsuleComponent()->GetScaledCapsuleHalfHeight() * 0.8f);
}
FVector AOZCharacter::AimDirection() const
{
	return Controller ? Controller->GetControlRotation().Vector() : GetActorForwardVector();
}
bool AOZCharacter::IsSprinting() const
{
	return bWantsSprint && MoveInput.Y > 0.3f && !bWantsAds && !bIsCrouched && GetCharacterMovement()->IsMovingOnGround() && !bSliding;
}

// ---------------------------------------------------------------- tick
void AOZCharacter::Tick(float Dt)
{
	Super::Tick(Dt);
	HitMarkerTime = FMath::Max(0.f, HitMarkerTime - Dt);
	HurtFlash = FMath::Max(0.f, HurtFlash - Dt);
	for (int32 i = HurtFrom.Num() - 1; i >= 0; i--) { HurtFrom[i].Value -= Dt; if (HurtFrom[i].Value <= 0.f) HurtFrom.RemoveAt(i); }
	if (!bAlive)
	{
		DeathTime += Dt;
		AnimateBody(Dt);
		return;
	}
	Suppression = FMath::Max(0.f, Suppression - Dt * 0.5f);
	SpawnProtect = FMath::Max(0.f, SpawnProtect - Dt);
	MeleeTimer -= Dt;
	// regeneração de vida após 5 s sem dano
	if (GetWorld()->TimeSeconds - LastDamageTime > 5.f && Health < MaxHealth) Health = FMath::Min(MaxHealth, Health + 25.f * Dt);
	TickMovement(Dt);
	TickWeapons(Dt);
	if (IsPlayerControlled()) { UpdateBreath(Dt); AnimateViewmodel(Dt); }
	AnimateBody(Dt);
}

void AOZCharacter::TickMovement(float Dt)
{
	UCharacterMovementComponent* M = GetCharacterMovement();
	// escalada
	if (bVaulting)
	{
		VaultT += Dt / 0.4f;
		const float K = FMath::Min(1.f, VaultT);
		FVector P = FMath::Lerp(VaultFrom, VaultTo, K);
		P.Z += FMath::Sin(K * UE_PI) * 35.f;
		SetActorLocation(P);
		if (K >= 1.f) { bVaulting = false; M->SetMovementMode(MOVE_Falling); M->Velocity = GetActorForwardVector() * 300.f; }
		return;
	}
	// deslize
	if (bSliding)
	{
		SlideTime -= Dt;
		const float Speed = M->Velocity.Size2D();
		M->Velocity = FVector(SlideDir.X, SlideDir.Y, 0.f) * FMath::Max(0.f, Speed - 850.f * Dt) + FVector(0, 0, M->Velocity.Z);
		if (SlideTime <= 0.f || Speed < 300.f || !M->IsMovingOnGround()) EndSlide();
		return;
	}
	const FOZWeaponState& W = CurrentWeapon();
	float Speed = IsSprinting() ? SprintSpeed : WalkSpeed;
	Speed *= W.Stats.MoveMul;
	if (AdsAlpha > 0.5f) Speed *= 0.62f;
	M->MaxWalkSpeed = Speed;
	M->MaxWalkSpeedCrouched = CrouchSpeed * W.Stats.MoveMul;
	if (IsPlayerControlled())
	{
		const FRotator Yaw(0.f, GetControlRotation().Yaw, 0.f);
		AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::X), MoveInput.Y);
		AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::Y), MoveInput.X);
	}
	// passos (som + ruído para a IA)
	const float HS = GetVelocity().Size2D();
	if (M->IsMovingOnGround() && HS > 100.f)
	{
		StepAcc += HS * Dt;
		if (StepAcc > (IsSprinting() ? 240.f : 190.f))
		{
			StepAcc = 0.f;
			if (!bIsCrouched)
			{
				OZSound::Play(this, OZSound::EKind::Step, GetActorLocation() - FVector(0, 0, 80), FMath::FRandRange(0.9f, 1.1f), IsSprinting() ? 0.6f : 0.35f, IsPlayerControlled());
				AOZGameMode::ReportNoise(this, GetActorLocation(), IsSprinting() ? 1800.f : 900.f, this);
			}
		}
	}
}

float AOZCharacter::CurrentSpread() const
{
	const FOZWeaponStats& S = CurrentWeapon().Stats;
	const float Moving = FMath::Min(1.f, GetVelocity().Size2D() / WalkSpeed);
	float Sp = S.SpreadHip * (1.f - AdsAlpha) + S.SpreadAds * AdsAlpha;
	Sp += S.SpreadMove * Moving * (1.f - AdsAlpha * 0.6f);
	if (S.Class != EOZWeaponClass::Shotgun) Sp += CurrentWeapon().Bloom * 0.18f * (1.f - AdsAlpha * 0.7f);
	if (bIsCrouched) Sp *= 0.75f;
	if (!GetCharacterMovement()->IsMovingOnGround()) Sp += 4.f;
	return Sp;
}

void AOZCharacter::TickWeapons(float Dt)
{
	SwitchTime = FMath::Max(0.f, SwitchTime - Dt);
	FOZWeaponState& W = CurrentWeaponMutable();
	if (W.Tick(Dt) && IsPlayerControlled()) OZSound::Play(this, OZSound::EKind::Reload, GetActorLocation(), 1.3f, 0.5f, true);
	for (int32 i = 0; i < Weapons.Num(); i++) if (i != Slot) Weapons[i].Cooldown -= Dt;
	const bool bAdsTarget = bWantsAds && W.Reloading <= 0.f && !IsSprinting() && SwitchTime <= 0.f;
	AdsAlpha = FMath::Clamp(AdsAlpha + (bAdsTarget ? 1.f : -1.f) * Dt / FMath::Max(0.05f, W.Stats.AdsTime), 0.f, 1.f);
	// recuperação do recuo
	if (RecoilPitch > 0.f && Controller)
	{
		const float Rec = FMath::Min(RecoilPitch, W.Stats.RecoilRecovery * Dt * (bWantsFire ? 0.35f : 1.f));
		FRotator R = Controller->GetControlRotation(); R.Pitch -= Rec; Controller->SetControlRotation(R);
		RecoilPitch -= Rec;
	}
	// recarga automática com o pente vazio
	if (W.InMag == 0 && W.InReserve > 0 && W.Reloading <= 0.f && W.Cooldown <= 0.f && !W.Stats.IsMelee() && (bWantsFire || IsBot())) Reload();
	if (SwitchTime > 0.f || IsSprinting()) { bFirePressed = false; return; }
	bool bShoot = false;
	switch (W.CurrentMode)
	{
	case EOZFireMode::Auto: bShoot = bWantsFire; break;
	case EOZFireMode::Burst: if (bFirePressed && W.BurstLeft <= 0) W.BurstLeft = 3; bShoot = W.BurstLeft > 0; break;
	case EOZFireMode::Melee: if (bFirePressed) { Melee(); bFirePressed = false; } return;
	default: bShoot = bFirePressed; break;
	}
	if (!bShoot) return;
	if (W.CanFire())
	{
		Shoot();
		if (W.CurrentMode == EOZFireMode::Burst) W.BurstLeft--;
		if (W.CurrentMode != EOZFireMode::Auto && W.CurrentMode != EOZFireMode::Burst) bFirePressed = false;
	}
	else if (W.InMag == 0 && bFirePressed)
	{
		if (IsPlayerControlled()) OZSound::Play(this, OZSound::EKind::Empty, GetActorLocation(), 1.f, 0.4f, true);
		W.BurstLeft = 0; bFirePressed = false;
	}
}

void AOZCharacter::Shoot()
{
	FOZWeaponState& W = CurrentWeaponMutable();
	const FOZWeaponStats& S = W.Stats;
	W.Consume();
	LastShotTime = GetWorld()->TimeSeconds;
	const FVector Eye = EyeLocation();
	const FRotator AimRot = Controller ? Controller->GetControlRotation() : GetActorRotation();
	const FVector Fwd = AimRot.Vector(), Right = FRotationMatrix(AimRot).GetUnitAxis(EAxis::Y), Up = FRotationMatrix(AimRot).GetUnitAxis(EAxis::Z);
	const float Spread = FMath::DegreesToRadians(CurrentSpread());
	UOZBallistics* Bal = GetWorld()->GetSubsystem<UOZBallistics>();
	for (int32 i = 0; i < S.Pellets; i++)
	{
		const float R = FMath::Sqrt(FMath::FRand()) * Spread * 0.5f, A = FMath::FRand() * 2.f * UE_PI;
		const FVector D = (Fwd + Right * (FMath::Cos(A) * FMath::Tan(R) + AimError.X) + Up * (FMath::Sin(A) * FMath::Tan(R) + AimError.Y)).GetSafeNormal();
		if (Bal) Bal->Fire(this, Eye, D, S, i == 0 || FMath::FRand() < 0.3f);
	}
	// recuo (o jogador sente mais; na IA vira erro)
	const float K = (1.f - AdsAlpha * 0.25f) * (bIsCrouched ? 0.82f : 1.f) * (IsPlayerControlled() ? 1.f : 0.4f);
	const float VK = S.RecoilVert * K * FMath::FRandRange(0.85f, 1.15f);
	if (Controller)
	{
		FRotator Rr = Controller->GetControlRotation();
		Rr.Pitch += VK; Rr.Yaw += S.RecoilHoriz * K * FMath::FRandRange(-1.f, 1.f);
		Controller->SetControlRotation(Rr);
	}
	RecoilPitch += VK;
	Kick = 1.f;
	const FVector Muzzle = MuzzleLocation();
	if (AOZEffects* FX = AOZEffects::Get(this)) FX->Muzzle(Muzzle, Fwd, S.Class == EOZWeaponClass::Shotgun || S.Class == EOZWeaponClass::Sniper ? 1.6f : 1.f);
	if (S.Mode != EOZFireMode::Bolt)
		if (AOZEffects* FX = AOZEffects::Get(this)) FX->Casing(Muzzle - Fwd * 30.f + Right * 8.f, Right);
	OZSound::Play(this, OZSound::EKind::Shot, Muzzle, S.SoundPitch * FMath::FRandRange(0.95f, 1.05f), S.SoundPower, IsPlayerControlled());
	AOZGameMode::ReportNoise(this, GetActorLocation(), 11000.f, this);
}

FVector AOZCharacter::MuzzleLocation() const
{
	if (IsPlayerControlled() && ViewMuzzle) return ViewMuzzle->GetComponentLocation();
	return BodyMuzzle ? BodyMuzzle->GetComponentLocation() : EyeLocation();
}

void AOZCharacter::Reload()
{
	if (CurrentWeaponMutable().StartReload()) OZSound::Play(this, OZSound::EKind::Reload, GetActorLocation(), 1.f, 0.5f, IsPlayerControlled());
}

void AOZCharacter::SwitchWeapon(int32 NewSlot)
{
	if (NewSlot == Slot || !Weapons.IsValidIndex(NewSlot)) return;
	CurrentWeaponMutable().Reloading = 0.f;
	Slot = NewSlot;
	SwitchTime = 0.45f;
}

void AOZCharacter::ThrowGrenade()
{
	if (Frags <= 0 || !bAlive) return;
	Frags--;
	FVector Dir = AimDirection(); Dir.Z += 0.18f; Dir.Normalize();
	FActorSpawnParameters P; P.Owner = this; P.Instigator = this;
	P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	if (AOZGrenade* G = GetWorld()->SpawnActor<AOZGrenade>(AOZGrenade::StaticClass(), EyeLocation() + Dir * 60.f, Dir.Rotation(), P))
		G->Launch(Dir * 1900.f + GetVelocity() * 0.5f, this);
}

void AOZCharacter::Melee()
{
	if (MeleeTimer > 0.f) return;
	MeleeTimer = 0.6f;
	OZSound::Play(this, OZSound::EKind::Melee, GetActorLocation(), 1.f, 0.7f, IsPlayerControlled());
	const FVector Eye = EyeLocation(), F = AimDirection();
	AOZCharacter* Best = nullptr; float BestD = 240.f;
	for (AOZCharacter* C : AOZGameMode::Characters(this))
	{
		if (C == this || !C->bAlive || C->Team == Team) continue;
		const FVector To = C->GetActorLocation() - Eye;
		const float D = To.Size();
		if (D < BestD && FVector::DotProduct(To.GetSafeNormal(), F) > 0.5f) { Best = C; BestD = D; }
	}
	if (Best)
	{
		const bool bBack = FVector::DotProduct(Best->GetActorForwardVector(), GetActorForwardVector()) > 0.5f;
		Best->ApplyHit(bBack ? 300.f : 55.f, EOZHitRegion::Chest, this, F, "knife");
		if (AOZEffects* FX = AOZEffects::Get(this)) FX->Blood(Best->GetActorLocation(), F, 2.f);
	}
}

// Escalar: obstáculo à frente com topo entre 45 e 135 cm acima dos pés.
void AOZCharacter::TryJumpOrVault()
{
	UCharacterMovementComponent* M = GetCharacterMovement();
	if (bSliding) { EndSlide(); Jump(); return; }
	if (!M->IsMovingOnGround()) return;
	const FVector Fwd = FRotationMatrix(FRotator(0, GetControlRotation().Yaw, 0)).GetUnitAxis(EAxis::X);
	const float Feet = GetActorLocation().Z - GetCapsuleComponent()->GetScaledCapsuleHalfHeight();
	FCollisionQueryParams Q(SCENE_QUERY_STAT(OZVault), false, this);
	FHitResult Hit;
	const FVector Start(GetActorLocation().X, GetActorLocation().Y, Feet + 60.f);
	if (GetWorld()->LineTraceSingleByChannel(Hit, Start, Start + Fwd * 120.f, ECC_Visibility, Q))
	{
		FHitResult Top;
		const FVector Probe = Hit.ImpactPoint + Fwd * 25.f;
		if (GetWorld()->LineTraceSingleByChannel(Top, FVector(Probe.X, Probe.Y, Feet + 160.f), FVector(Probe.X, Probe.Y, Feet), ECC_Visibility, Q))
		{
			const float Rise = Top.ImpactPoint.Z - Feet;
			FHitResult Clear;
			const FVector Over(GetActorLocation().X, GetActorLocation().Y, Top.ImpactPoint.Z + 100.f);
			if (Rise > 45.f && Rise < 135.f && !GetWorld()->LineTraceSingleByChannel(Clear, Over, Over + Fwd * 150.f, ECC_Visibility, Q))
			{
				bVaulting = true; VaultT = 0.f;
				VaultFrom = GetActorLocation();
				VaultTo = FVector(Probe.X, Probe.Y, Top.ImpactPoint.Z) + Fwd * 50.f + FVector(0, 0, GetCapsuleComponent()->GetScaledCapsuleHalfHeight() + 2.f);
				M->SetMovementMode(MOVE_Flying);
				M->Velocity = FVector::ZeroVector;
				return;
			}
		}
	}
	if (bIsCrouched) { UnCrouch(); bCrouchToggle = false; return; }
	Jump();
}

void AOZCharacter::StartSlide()
{
	UCharacterMovementComponent* M = GetCharacterMovement();
	bSliding = true; SlideTime = 0.9f;
	SlideDir = M->Velocity.GetSafeNormal2D();
	if (SlideDir.IsNearlyZero()) SlideDir = GetActorForwardVector();
	Crouch();
	M->MaxWalkSpeedCrouched = 1200.f;
	M->GroundFriction = 0.f;
	M->BrakingDecelerationWalking = 0.f;
	M->Velocity = SlideDir * FMath::Max(M->Velocity.Size2D(), SprintSpeed) * 1.35f;
	OZSound::Play(this, OZSound::EKind::Step, GetActorLocation(), 0.5f, 0.8f, IsPlayerControlled());
}
void AOZCharacter::EndSlide()
{
	UCharacterMovementComponent* M = GetCharacterMovement();
	bSliding = false;
	M->MaxWalkSpeedCrouched = CrouchSpeed;
	M->GroundFriction = 9.f;
	M->BrakingDecelerationWalking = 2400.f;
	if (!bCrouchToggle) UnCrouch();
}

// ---------------------------------------------------------------- dano
bool AOZCharacter::RayHit(const FVector& O, const FVector& D, float MaxT, float& OutT, EOZHitRegion& OutRegion) const
{
	if (!bAlive) return false;
	const float Half = GetCapsuleComponent()->GetScaledCapsuleHalfHeight();
	const FVector Feet = GetActorLocation() - FVector(0, 0, Half);
	const float K = Half / StandHalf;
	bool bAny = false; float T = 0.f;
	auto Try = [&](bool bHit, EOZHitRegion R) { if (bHit && (!bAny || T < OutT)) { OutT = T; OutRegion = R; bAny = true; } };
	Try(RaySphere(O, D, Feet + FVector(0, 0, 164.f * K), 15.f, MaxT, T), EOZHitRegion::Head);
	const float W = 24.f;
	Try(RayBox(O, D, Feet + FVector(-W, -W, 118.f * K), Feet + FVector(W, W, 150.f * K), MaxT, T), EOZHitRegion::Chest);
	Try(RayBox(O, D, Feet + FVector(-W * 0.85f, -W * 0.85f, 88.f * K), Feet + FVector(W * 0.85f, W * 0.85f, 118.f * K), MaxT, T), EOZHitRegion::Stomach);
	Try(RayBox(O, D, Feet + FVector(-20.f, -20.f, 0.f), Feet + FVector(20.f, 20.f, 88.f * K), MaxT, T), EOZHitRegion::Leg);
	return bAny;
}

void AOZCharacter::ApplyHit(float Damage, EOZHitRegion Region, AOZCharacter* Inst, const FVector& Dir, FName WeaponId, bool bExplosive, float Dist)
{
	if (!bAlive || SpawnProtect > 0.f) return;
	if (Inst && Inst != this && Inst->Team == Team) return; // sem fogo amigo
	if (Armor > 0.f) { const float Abs = FMath::Min(Armor, Damage * 0.55f); Armor -= Abs; Damage -= Abs; }
	Health -= Damage;
	LastDamageTime = GetWorld()->TimeSeconds;
	Suppression = FMath::Min(1.5f, Suppression + 0.4f);
	HurtFlash = FMath::Min(1.f, HurtFlash + Damage / 60.f);
	if (Inst && Inst != this) HurtFrom.Add(TPair<FVector, float>(Inst->GetActorLocation(), 1.4f));
	if (Inst && Inst->IsPlayerControlled() && Inst != this)
	{
		Inst->HitMarkerTime = 0.18f; Inst->bHitMarkerKill = Health <= 0.f;
		OZSound::Play(Inst, Health <= 0.f ? OZSound::EKind::Kill : OZSound::EKind::Hit, Inst->GetActorLocation(), Region == EOZHitRegion::Head ? 1.4f : 1.f, 0.5f, true);
	}
	if (AOZGameMode* GM = GetWorld()->GetAuthGameMode<AOZGameMode>()) GM->OnDamaged(this, Inst);
	if (Health <= 0.f) Die(Inst, WeaponId, Region == EOZHitRegion::Head, bExplosive, Dist);
}

void AOZCharacter::OnNearMiss(AOZCharacter* Shooter)
{
	Suppression = FMath::Min(1.5f, Suppression + 0.35f);
	if (AOZGameMode* GM = GetWorld()->GetAuthGameMode<AOZGameMode>()) GM->OnNearMiss(this, Shooter);
}

void AOZCharacter::Die(AOZCharacter* Killer, FName WeaponId, bool bHeadshot, bool bExplosive, float Dist)
{
	bAlive = false; Health = 0.f; DeathTime = 0.f; Deaths++;
	LastKiller = Killer;
	bWantsFire = false; bFirePressed = false;
	if (bSliding) EndSlide();
	GetCharacterMovement()->DisableMovement();
	GetCapsuleComponent()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	if (Killer && Killer != this) { Killer->Kills++; Killer->Score += 100 + (bHeadshot ? 50 : 0); }
	if (AOZGameMode* GM = GetWorld()->GetAuthGameMode<AOZGameMode>()) GM->OnKilled(this, Killer, WeaponId, bHeadshot, bExplosive, Dist);
}

void AOZCharacter::Respawn(const FVector& Location, float Yaw)
{
	SetActorLocation(Location, false, nullptr, ETeleportType::TeleportPhysics);
	if (Controller) Controller->SetControlRotation(FRotator(0.f, Yaw, 0.f));
	SetActorRotation(FRotator(0.f, Yaw, 0.f));
	Health = MaxHealth; Armor = 0.f; bAlive = true; DeathTime = -1.f; SpawnProtect = 2.f; Suppression = 0.f; Frags = 2;
	for (FOZWeaponState& W : Weapons) { W.InMag = W.Stats.Mag; W.InReserve = W.Stats.Reserve; W.Reloading = 0.f; W.Cooldown = 0.f; }
	GetCapsuleComponent()->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	GetCharacterMovement()->SetMovementMode(MOVE_Walking);
	if (BodyRoot) BodyRoot->SetRelativeRotation(FRotator::ZeroRotator);
}

// ---------------------------------------------------------------- respiração na luneta
void AOZCharacter::UpdateBreath(float Dt)
{
	const FOZWeaponState& W = CurrentWeapon();
	bScoped = AdsAlpha > 0.9f && W.Stats.AdsZoom >= 3.f;
	BreathOut = FMath::Max(0.f, BreathOut - Dt);
	float Amp = 0.f;
	if (bScoped)
	{
		bHoldingBreath = bWantsSprint && Breath > 0.f && BreathOut <= 0.f;
		Breath = bHoldingBreath ? FMath::Max(0.f, Breath - Dt / 4.5f) : FMath::Min(1.f, Breath + Dt / 3.f);
		if (Breath <= 0.f && BreathOut <= 0.f) BreathOut = 2.5f;
		Amp = bHoldingBreath ? 0.02f : (BreathOut > 0.f ? 0.6f : 0.25f); // graus
		if (bIsCrouched) Amp *= 0.6f;
	}
	else { bHoldingBreath = false; Breath = FMath::Min(1.f, Breath + Dt / 3.f); }
	const float T = GetWorld()->TimeSeconds;
	const FVector2D Sway(FMath::Sin(T * 0.9f) * Amp + FMath::Sin(T * 2.3f) * Amp * 0.35f, FMath::Sin(T * 1.35f) * Amp * 0.75f);
	if (Controller)
	{
		FRotator R = Controller->GetControlRotation();
		R.Yaw += Sway.X - SwayPrev.X; R.Pitch += Sway.Y - SwayPrev.Y;
		Controller->SetControlRotation(R);
	}
	SwayPrev = Sway;
	// FOV com zoom da mira
	const float Zoom = FMath::Lerp(1.f, W.Stats.AdsZoom, AdsAlpha);
	const float Fov = FMath::RadiansToDegrees(2.f * FMath::Atan(FMath::Tan(FMath::DegreesToRadians(BaseFOV) * 0.5f) / Zoom));
	Camera->SetFieldOfView(Fov);
}
