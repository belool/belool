#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "OZTypes.h"
#include "OZCharacter.generated.h"

class UCameraComponent;
class USceneComponent;
class UStaticMeshComponent;
class UInputAction;
class UInputMappingContext;
class UNavigationInvokerComponent;
struct FInputActionValue;

// ================================================================
// AOZCharacter — o mesmo ator para jogador e bots (como no protótipo
// web): quem controla preenche as "intenções" (mover, atirar, mirar);
// o personagem executa movimento, armas, dano e animação procedural.
// ================================================================
UCLASS()
class OPERATIONZERO_API AOZCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	AOZCharacter();
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
	virtual void PossessedBy(AController* NewController) override;

	// ---------------- identidade e estado ----------------
	UPROPERTY(BlueprintReadOnly, Category = "OZ") int32 Team = 0;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") FString CallSign = TEXT("Soldado");
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float Health = 100.f;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float MaxHealth = 100.f;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float Armor = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") bool bAlive = true;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") int32 Kills = 0;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") int32 Deaths = 0;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") int32 Score = 0;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") TArray<FOZWeaponState> Weapons;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") int32 Slot = 0;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") int32 Frags = 2;

	// ---------------- intenções (jogador ou IA) ----------------
	FVector2D MoveInput = FVector2D::ZeroVector;
	bool bWantsSprint = false;
	bool bWantsFire = false;
	bool bFirePressed = false;
	bool bWantsAds = false;
	FVector2D AimError = FVector2D::ZeroVector;   // erro de mira da IA (radianos)
	float AdsAlpha = 0.f;
	float Suppression = 0.f;
	float LastShotTime = -100.f;
	float LastDamageTime = -100.f;
	float SpawnProtect = 0.f;
	TWeakObjectPtr<AOZCharacter> LastKiller;

	// ---------------- feedback para o HUD ----------------
	float HitMarkerTime = 0.f;
	bool bHitMarkerKill = false;
	float HurtFlash = 0.f;
	TArray<TPair<FVector, float>> HurtFrom;      // direção do dano + tempo
	float Breath = 1.f;
	bool bHoldingBreath = false;
	bool bScoped = false;

	// ---------------- API ----------------
	FVector EyeLocation() const;
	FVector AimDirection() const;
	const FOZWeaponState& CurrentWeapon() const;
	FOZWeaponState& CurrentWeaponMutable();
	float CurrentSpread() const;
	bool IsSprinting() const;
	bool IsBot() const;
	void SetLoadout(FName Primary, FName Secondary);
	void Reload();
	void SwitchWeapon(int32 NewSlot);
	void ThrowGrenade();
	void Melee();
	void TryJumpOrVault();
	void ApplyHit(float Damage, EOZHitRegion Region, AOZCharacter* ByCharacter, const FVector& Dir, FName WeaponId, bool bExplosive = false, float Dist = 0.f);
	void OnNearMiss(AOZCharacter* Shooter);
	void Respawn(const FVector& Location, float Yaw);
	void SetTeamColors();
	// Teste de raio contra as caixas de acerto (cabeça, tórax, abdômen, pernas).
	bool RayHit(const FVector& O, const FVector& D, float MaxT, float& OutT, EOZHitRegion& OutRegion) const;

	UPROPERTY(VisibleAnywhere, Category = "OZ") UCameraComponent* Camera;
	UPROPERTY(VisibleAnywhere, Category = "OZ") UNavigationInvokerComponent* NavInvoker;

protected:
	void TickWeapons(float Dt);
	void TickMovement(float Dt);
	void Shoot();
	void Die(AOZCharacter* Killer, FName WeaponId, bool bHeadshot, bool bExplosive, float Dist);
	void BuildBody();
	void BuildViewmodel();
	void AnimateBody(float Dt);
	void AnimateViewmodel(float Dt);
	void UpdateBreath(float Dt);
	void StartSlide();
	void EndSlide();
	FVector MuzzleLocation() const;
	float StandHalfOffset() const;

	// entrada (Enhanced Input criado em C++, sem assets)
	void CreateInput();
	void OnMove(const FInputActionValue& V);
	void OnMoveStop(const FInputActionValue& V);
	void OnLook(const FInputActionValue& V);
	void OnFireStart(const FInputActionValue& V);
	void OnFireStop(const FInputActionValue& V);
	void OnAdsStart(const FInputActionValue& V);
	void OnAdsStop(const FInputActionValue& V);
	void OnSprintStart(const FInputActionValue& V);
	void OnSprintStop(const FInputActionValue& V);
	void OnJump(const FInputActionValue& V);
	void OnCrouch(const FInputActionValue& V);
	void OnReload(const FInputActionValue& V);
	void OnSlot1(const FInputActionValue& V);
	void OnSlot2(const FInputActionValue& V);
	void OnWheel(const FInputActionValue& V);
	void OnGrenade(const FInputActionValue& V);
	void OnMelee(const FInputActionValue& V);
	void OnFireMode(const FInputActionValue& V);

	UPROPERTY() UInputMappingContext* Mapping;
	UPROPERTY() TMap<FName, UInputAction*> Actions;

	// visual em 3ª pessoa
	UPROPERTY() USceneComponent* BodyRoot;
	UPROPERTY() USceneComponent* Hips;
	UPROPERTY() USceneComponent* Spine;
	UPROPERTY() USceneComponent* Neck;
	UPROPERTY() USceneComponent* LegL[2];
	UPROPERTY() USceneComponent* LegR[2];
	UPROPERTY() USceneComponent* ArmL[2];
	UPROPERTY() USceneComponent* ArmR[2];
	UPROPERTY() USceneComponent* GunPivot;
	UPROPERTY() USceneComponent* BodyMuzzle;
	UPROPERTY() TArray<UStaticMeshComponent*> BodyParts;
	// arma em 1ª pessoa
	UPROPERTY() USceneComponent* ViewRoot;
	UPROPERTY() USceneComponent* ViewMuzzle;
	UPROPERTY() TArray<UStaticMeshComponent*> ViewParts;
	FName ViewWeaponId;

	float WalkPhase = 0.f;
	float DeathTime = -1.f;
	float RecoilPitch = 0.f;
	float Kick = 0.f;
	float SwitchTime = 0.f;
	float MeleeTimer = 0.f;
	float StepAcc = 0.f;
	bool bCrouchToggle = false;
	bool bSliding = false;
	float SlideTime = 0.f;
	FVector SlideDir = FVector::ZeroVector;
	bool bVaulting = false;
	float VaultT = 0.f;
	FVector VaultFrom, VaultTo;
	float BreathOut = 0.f;
	FVector2D SwayPrev = FVector2D::ZeroVector;
	float BaseFOV = 90.f;
	float MouseSensitivity = 0.07f;
};
