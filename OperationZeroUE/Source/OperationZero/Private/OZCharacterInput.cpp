#include "OZCharacter.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Engine/LocalPlayer.h"

// ================================================================
// Entrada do jogador com Enhanced Input criada em C++ (sem assets):
// WASD, mouse, Shift correr/respirar, C agachar/deslizar, Espaço
// pular/escalar, botões do mouse atirar/mirar, R, 1/2/roda, G, V, B.
// ================================================================

void AOZCharacter::CreateInput()
{
	if (Mapping) return;
	Mapping = NewObject<UInputMappingContext>(this);
	auto Make = [this](FName Name, EInputActionValueType Type) {
		UInputAction* A = NewObject<UInputAction>(this, Name);
		A->ValueType = Type;
		Actions.Add(Name, A);
		return A;
	};
	UInputAction* ActMove = Make("Move", EInputActionValueType::Axis2D);
	{
		// W: (0,1) | S: (0,-1) | A: (-1,0) | D: (1,0)
		FEnhancedActionKeyMapping& W = Mapping->MapKey(ActMove, EKeys::W);
		UInputModifierSwizzleAxis* SwW = NewObject<UInputModifierSwizzleAxis>(this); SwW->Order = EInputAxisSwizzle::YXZ; W.Modifiers.Add(SwW);
		FEnhancedActionKeyMapping& S = Mapping->MapKey(ActMove, EKeys::S);
		UInputModifierSwizzleAxis* SwS = NewObject<UInputModifierSwizzleAxis>(this); SwS->Order = EInputAxisSwizzle::YXZ; S.Modifiers.Add(SwS);
		S.Modifiers.Add(NewObject<UInputModifierNegate>(this));
		FEnhancedActionKeyMapping& A = Mapping->MapKey(ActMove, EKeys::A);
		A.Modifiers.Add(NewObject<UInputModifierNegate>(this));
		Mapping->MapKey(ActMove, EKeys::D);
	}
	Mapping->MapKey(Make("Look", EInputActionValueType::Axis2D), EKeys::Mouse2D);
	Mapping->MapKey(Make("Fire", EInputActionValueType::Boolean), EKeys::LeftMouseButton);
	Mapping->MapKey(Make("Ads", EInputActionValueType::Boolean), EKeys::RightMouseButton);
	Mapping->MapKey(Make("Sprint", EInputActionValueType::Boolean), EKeys::LeftShift);
	Mapping->MapKey(Make("Jump", EInputActionValueType::Boolean), EKeys::SpaceBar);
	UInputAction* ActCrouch = Make("Crouch", EInputActionValueType::Boolean);
	Mapping->MapKey(ActCrouch, EKeys::C);
	Mapping->MapKey(ActCrouch, EKeys::LeftControl);
	Mapping->MapKey(Make("Reload", EInputActionValueType::Boolean), EKeys::R);
	Mapping->MapKey(Make("Slot1", EInputActionValueType::Boolean), EKeys::One);
	Mapping->MapKey(Make("Slot2", EInputActionValueType::Boolean), EKeys::Two);
	Mapping->MapKey(Make("Wheel", EInputActionValueType::Axis1D), EKeys::MouseWheelAxis);
	Mapping->MapKey(Make("Grenade", EInputActionValueType::Boolean), EKeys::G);
	Mapping->MapKey(Make("Melee", EInputActionValueType::Boolean), EKeys::V);
	Mapping->MapKey(Make("FireMode", EInputActionValueType::Boolean), EKeys::B);
}

void AOZCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);
	CreateInput();
	if (APlayerController* PC = Cast<APlayerController>(GetController()))
		if (UEnhancedInputLocalPlayerSubsystem* Sub = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()))
		{
			Sub->ClearAllMappings();
			Sub->AddMappingContext(Mapping, 0);
		}
	UEnhancedInputComponent* EI = Cast<UEnhancedInputComponent>(PlayerInputComponent);
	if (!EI) return;
	EI->BindAction(Actions["Move"], ETriggerEvent::Triggered, this, &AOZCharacter::OnMove);
	EI->BindAction(Actions["Move"], ETriggerEvent::Completed, this, &AOZCharacter::OnMoveStop);
	EI->BindAction(Actions["Look"], ETriggerEvent::Triggered, this, &AOZCharacter::OnLook);
	EI->BindAction(Actions["Fire"], ETriggerEvent::Started, this, &AOZCharacter::OnFireStart);
	EI->BindAction(Actions["Fire"], ETriggerEvent::Completed, this, &AOZCharacter::OnFireStop);
	EI->BindAction(Actions["Ads"], ETriggerEvent::Started, this, &AOZCharacter::OnAdsStart);
	EI->BindAction(Actions["Ads"], ETriggerEvent::Completed, this, &AOZCharacter::OnAdsStop);
	EI->BindAction(Actions["Sprint"], ETriggerEvent::Started, this, &AOZCharacter::OnSprintStart);
	EI->BindAction(Actions["Sprint"], ETriggerEvent::Completed, this, &AOZCharacter::OnSprintStop);
	EI->BindAction(Actions["Jump"], ETriggerEvent::Started, this, &AOZCharacter::OnJump);
	EI->BindAction(Actions["Crouch"], ETriggerEvent::Started, this, &AOZCharacter::OnCrouch);
	EI->BindAction(Actions["Reload"], ETriggerEvent::Started, this, &AOZCharacter::OnReload);
	EI->BindAction(Actions["Slot1"], ETriggerEvent::Started, this, &AOZCharacter::OnSlot1);
	EI->BindAction(Actions["Slot2"], ETriggerEvent::Started, this, &AOZCharacter::OnSlot2);
	EI->BindAction(Actions["Wheel"], ETriggerEvent::Triggered, this, &AOZCharacter::OnWheel);
	EI->BindAction(Actions["Grenade"], ETriggerEvent::Started, this, &AOZCharacter::OnGrenade);
	EI->BindAction(Actions["Melee"], ETriggerEvent::Started, this, &AOZCharacter::OnMelee);
	EI->BindAction(Actions["FireMode"], ETriggerEvent::Started, this, &AOZCharacter::OnFireMode);
}

void AOZCharacter::OnMove(const FInputActionValue& V) { MoveInput = V.Get<FVector2D>(); }
void AOZCharacter::OnMoveStop(const FInputActionValue& V) { MoveInput = FVector2D::ZeroVector; }
void AOZCharacter::OnLook(const FInputActionValue& V)
{
	if (!Controller || !bAlive) return;
	const FVector2D D = V.Get<FVector2D>();
	const float Zoom = FMath::Lerp(1.f, CurrentWeapon().Stats.AdsZoom, AdsAlpha);
	const float Sens = MouseSensitivity * (AdsAlpha > 0.5f ? 0.75f / FMath::Sqrt(Zoom) : 1.f) * 10.f;
	FRotator R = Controller->GetControlRotation();
	R.Yaw += D.X * Sens;
	R.Pitch = FMath::Clamp(FRotator::NormalizeAxis(R.Pitch + D.Y * Sens), -85.f, 85.f);
	Controller->SetControlRotation(R);
}
void AOZCharacter::OnFireStart(const FInputActionValue& V) { bWantsFire = true; bFirePressed = true; }
void AOZCharacter::OnFireStop(const FInputActionValue& V) { bWantsFire = false; if (CurrentWeapon().CurrentMode != EOZFireMode::Burst) bFirePressed = false; }
void AOZCharacter::OnAdsStart(const FInputActionValue& V) { bWantsAds = true; }
void AOZCharacter::OnAdsStop(const FInputActionValue& V) { bWantsAds = false; }
void AOZCharacter::OnSprintStart(const FInputActionValue& V) { bWantsSprint = true; }
void AOZCharacter::OnSprintStop(const FInputActionValue& V) { bWantsSprint = false; }
void AOZCharacter::OnJump(const FInputActionValue& V) { if (bAlive) TryJumpOrVault(); }
void AOZCharacter::OnCrouch(const FInputActionValue& V)
{
	if (!bAlive) return;
	if (IsSprinting()) { StartSlide(); return; } // agachar correndo = deslizar
	bCrouchToggle = !bCrouchToggle;
	if (bCrouchToggle) Crouch(); else UnCrouch();
}
void AOZCharacter::OnReload(const FInputActionValue& V) { if (bAlive) Reload(); }
void AOZCharacter::OnSlot1(const FInputActionValue& V) { SwitchWeapon(0); }
void AOZCharacter::OnSlot2(const FInputActionValue& V) { SwitchWeapon(1); }
void AOZCharacter::OnWheel(const FInputActionValue& V) { if (FMath::Abs(V.Get<float>()) > 0.f) SwitchWeapon((Slot + 1) % FMath::Max(1, Weapons.Num())); }
void AOZCharacter::OnGrenade(const FInputActionValue& V) { ThrowGrenade(); }
void AOZCharacter::OnMelee(const FInputActionValue& V) { if (bAlive) Melee(); }
void AOZCharacter::OnFireMode(const FInputActionValue& V)
{
	FOZWeaponState& W = CurrentWeaponMutable();
	if (W.Stats.Class == EOZWeaponClass::AssaultRifle || W.Stats.Class == EOZWeaponClass::SMG)
		W.CurrentMode = W.CurrentMode == EOZFireMode::Auto ? EOZFireMode::Burst : W.CurrentMode == EOZFireMode::Burst ? EOZFireMode::Semi : EOZFireMode::Auto;
}
