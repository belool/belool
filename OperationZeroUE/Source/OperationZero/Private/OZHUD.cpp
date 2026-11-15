#include "OZHUD.h"
#include "OZCharacter.h"
#include "OZGameMode.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "Camera/CameraComponent.h"

static const FLinearColor Accent(1.f, 0.69f, 0.13f), Ally(0.29f, 0.64f, 1.f), Enemy(1.f, 0.29f, 0.29f), Dim(0.6f, 0.64f, 0.68f);

void AOZHUD::Text(const FString& S, float X, float Y, const FLinearColor& C, float Scale, bool bCenter, bool bRight)
{
	UFont* F = GEngine->GetMediumFont();
	float W = 0.f, H = 0.f;
	GetTextSize(S, W, H, F, Scale);
	if (bCenter) X -= W / 2; else if (bRight) X -= W;
	DrawText(S, FLinearColor(0, 0, 0, 0.8f), X + 1.5f, Y + 1.5f, F, Scale);
	DrawText(S, C, X, Y, F, Scale);
}

void AOZHUD::DrawHUD()
{
	Super::DrawHUD();
	if (!Canvas) return;
	AOZCharacter* P = Cast<AOZCharacter>(GetOwningPawn());
	AOZGameMode* GM = AOZGameMode::Get(this);
	const float SX = Canvas->ClipX, SY = Canvas->ClipY, CX = SX / 2, CY = SY / 2;
	const float U = SY / 1080.f; // escala de interface
	if (!P || !GM) return;
	const FOZWeaponState& W = P->CurrentWeapon();
	// luneta
	if (P->bScoped && W.Stats.bScope)
	{
		const float R = SY * 0.46f;
		DrawRect(FLinearColor::Black, 0, 0, CX - R, SY);
		DrawRect(FLinearColor::Black, CX + R, 0, SX - CX - R, SY);
		DrawRect(FLinearColor::Black, CX - R, 0, R * 2, CY - R);
		DrawRect(FLinearColor::Black, CX - R, CY + R, R * 2, SY - CY - R);
		DrawLine(CX - R, CY, CX + R, CY, FLinearColor::Black, 1.5f);
		DrawLine(CX, CY - R, CX, CY + R, FLinearColor::Black, 1.5f);
		Text(P->bHoldingBreath ? TEXT("prendendo a respiração") : TEXT("segure Shift para estabilizar"), CX, CY + R * 0.75f, FLinearColor::White, 0.9f * U, true);
		DrawRect(FLinearColor(0.22f, 0.76f, 1.f), CX - 110 * U, CY + R * 0.75f + 26 * U, 220 * U * P->Breath, 4 * U);
	}
	// vinheta de dano
	const float Low = P->Health / P->MaxHealth;
	const float Red = FMath::Max(P->HurtFlash * 0.6f, Low < 0.35f ? (0.35f - Low) * 1.4f : 0.f);
	if (Red > 0.01f) { DrawRect(FLinearColor(0.6f, 0.f, 0.f, Red * 0.5f), 0, 0, SX, 40 * U); DrawRect(FLinearColor(0.6f, 0.f, 0.f, Red * 0.5f), 0, SY - 40 * U, SX, 40 * U); DrawRect(FLinearColor(0.6f, 0.f, 0.f, Red * 0.4f), 0, 0, 40 * U, SY); DrawRect(FLinearColor(0.6f, 0.f, 0.f, Red * 0.4f), SX - 40 * U, 0, 40 * U, SY); }
	if (P->bAlive)
	{
		// mira dinâmica (abre com a dispersão)
		if (P->AdsAlpha < 0.6f && !P->IsSprinting())
		{
			const float Fov = P->Camera ? P->Camera->FieldOfView : 90.f;
			const float Gap = FMath::Max(4.f, FMath::Tan(FMath::DegreesToRadians(P->CurrentSpread() * 0.5f)) / FMath::Tan(FMath::DegreesToRadians(Fov * 0.5f)) * SX * 0.5f);
			const FLinearColor C = FLinearColor::White;
			DrawLine(CX - Gap - 10 * U, CY, CX - Gap, CY, C, 2.f); DrawLine(CX + Gap, CY, CX + Gap + 10 * U, CY, C, 2.f);
			DrawLine(CX, CY - Gap - 10 * U, CX, CY - Gap, C, 2.f); DrawLine(CX, CY + Gap, CX, CY + Gap + 10 * U, C, 2.f);
		}
		if (P->HitMarkerTime > 0.f)
		{
			const FLinearColor C = P->bHitMarkerKill ? Enemy : FLinearColor::White;
			const float A = 6 * U, B = 14 * U;
			DrawLine(CX - B, CY - B, CX - A, CY - A, C, 2.f); DrawLine(CX + B, CY - B, CX + A, CY - A, C, 2.f);
			DrawLine(CX - B, CY + B, CX - A, CY + A, C, 2.f); DrawLine(CX + B, CY + B, CX + A, CY + A, C, 2.f);
		}
		// direção do dano
		for (const TPair<FVector, float>& H : P->HurtFrom)
		{
			const FVector To = H.Key - P->GetActorLocation();
			const float Ang = FMath::DegreesToRadians(To.Rotation().Yaw - P->GetControlRotation().Yaw);
			const float R = 130 * U;
			const float X = CX + FMath::Sin(Ang) * R, Y = CY - FMath::Cos(Ang) * R;
			DrawRect(FLinearColor(1.f, 0.1f, 0.1f, FMath::Min(1.f, H.Value)), X - 9 * U, Y - 9 * U, 18 * U, 18 * U);
		}
	}
	// vida e armadura
	const float BX = 24 * U, BY = SY - 60 * U, BW = 300 * U;
	DrawRect(FLinearColor(0, 0, 0, 0.55f), BX, BY, BW, 16 * U);
	DrawRect(Low < 0.35f ? Enemy : FLinearColor(0.9f, 0.93f, 0.95f), BX, BY, BW * FMath::Clamp(Low, 0.f, 1.f), 16 * U);
	Text(FString::FromInt(FMath::CeilToInt(P->Health)), BX + BW - 6 * U, BY - 1 * U, FLinearColor(0.05f, 0.05f, 0.05f), 0.9f * U, false, true);
	DrawRect(FLinearColor(0, 0, 0, 0.55f), BX, BY - 14 * U, BW, 8 * U);
	DrawRect(FLinearColor(0.18f, 0.49f, 1.f), BX, BY - 14 * U, BW * FMath::Clamp(P->Armor / 100.f, 0.f, 1.f), 8 * U);
	// munição
	const FString Mag = W.Stats.IsMelee() ? TEXT("—") : FString::FromInt(W.InMag);
	Text(W.Stats.DisplayName.ToUpper(), SX - 24 * U, SY - 120 * U, Dim, 1.f * U, false, true);
	Text(Mag + (W.Stats.IsMelee() ? TEXT("") : FString::Printf(TEXT(" / %d"), W.InReserve)), SX - 24 * U, SY - 96 * U, W.InMag <= W.Stats.Mag / 4 ? Enemy : FLinearColor::White, 2.4f * U, false, true);
	const TCHAR* Mode = W.CurrentMode == EOZFireMode::Auto ? TEXT("AUTO") : W.CurrentMode == EOZFireMode::Burst ? TEXT("RAJADA") : W.CurrentMode == EOZFireMode::Semi ? TEXT("SEMI") : W.CurrentMode == EOZFireMode::Bolt ? TEXT("FERROLHO") : W.CurrentMode == EOZFireMode::Pump ? TEXT("BOMBA") : TEXT("");
	Text(FString::Printf(TEXT("%s  ·  Granadas: %d"), Mode, P->Frags), SX - 24 * U, SY - 40 * U, Dim, 0.85f * U, false, true);
	if (W.Reloading > 0.f) Text(TEXT("RECARREGANDO"), CX, CY + 60 * U, Accent, 1.f * U, true);
	else if (!W.Stats.IsMelee() && W.InMag <= W.Stats.Mag / 5) Text(TEXT("[R] RECARREGAR"), CX, CY + 60 * U, Accent, 1.f * U, true);
	// placar e tempo
	const int32 Secs = FMath::Max(0, FMath::CeilToInt(GM->TimeLeft));
	DrawRect(FLinearColor(0, 0, 0, 0.5f), CX - 140 * U, 10 * U, 130 * U, 40 * U); DrawRect(Ally, CX - 140 * U, 47 * U, 130 * U, 3 * U);
	DrawRect(FLinearColor(0, 0, 0, 0.5f), CX + 10 * U, 10 * U, 130 * U, 40 * U); DrawRect(Enemy, CX + 10 * U, 47 * U, 130 * U, 3 * U);
	Text(FString::FromInt(GM->Scores[0]), CX - 75 * U, 14 * U, FLinearColor::White, 1.6f * U, true);
	Text(FString::FromInt(GM->Scores[1]), CX + 75 * U, 14 * U, FLinearColor::White, 1.6f * U, true);
	Text(FString::Printf(TEXT("%d:%02d"), Secs / 60, Secs % 60), CX, 56 * U, Dim, 0.9f * U, true);
	Text(TEXT("MATA-MATA EM EQUIPES 5X5"), 24 * U, 18 * U, Accent, 0.8f * U);
	Text(FString::Printf(TEXT("Primeira equipe a %d abates vence"), GM->ScoreLimit), 24 * U, 40 * U, FLinearColor::White, 1.f * U);
	// rádio da equipe
	float RY = 76 * U;
	for (const FOZRadio& R : GM->RadioLog)
	{
		if (GetWorld()->TimeSeconds - R.Time > 5.f) continue;
		DrawRect(FLinearColor(0.02f, 0.03f, 0.04f, 0.7f), 24 * U, RY, 380 * U, 26 * U);
		Text(R.From + TEXT(": ") + R.Text, 32 * U, RY + 3 * U, FLinearColor::White, 0.85f * U);
		RY += 30 * U;
	}
	// feed de abates
	float KY = 250 * U;
	for (int32 i = GM->KillFeed.Num() - 1; i >= 0; i--)
	{
		const FOZKillEntry& K = GM->KillFeed[i];
		if (GetWorld()->TimeSeconds - K.Time > 7.f) continue;
		const FString S = (K.Killer.IsEmpty() ? FString() : K.Killer + TEXT("  ")) + TEXT("[") + K.Weapon + (K.bHeadshot ? TEXT(" ⌖") : TEXT("")) + TEXT("]  ") + K.Victim;
		const FLinearColor C = K.bKillerIsPlayer ? Accent : (K.KillerTeam == P->Team ? Ally : Enemy);
		Text(S, SX - 24 * U, KY, C, 0.85f * U, false, true);
		KY += 24 * U;
	}
	DrawMinimap(P, SX - 224 * U, 16 * U, 200 * U);
	// morte e fim de partida
	if (!P->bAlive && !GM->bMatchOver)
	{
		DrawRect(FLinearColor(0.2f, 0.f, 0.f, 0.35f), 0, 0, SX, SY);
		Text(TEXT("VOCÊ FOI ABATIDO"), CX, CY - 40 * U, Enemy, 2.4f * U, true);
		if (P->LastKiller.IsValid()) Text(TEXT("Abatido por ") + P->LastKiller->CallSign, CX, CY + 10 * U, FLinearColor::White, 1.f * U, true);
	}
	if (GM->bMatchOver)
	{
		DrawRect(FLinearColor(0.f, 0.f, 0.f, 0.6f), 0, 0, SX, SY);
		const bool bWin = GM->WinnerTeam == P->Team;
		Text(GM->WinnerTeam < 0 ? TEXT("EMPATE") : bWin ? TEXT("VITÓRIA") : TEXT("DERROTA"), CX, CY - 60 * U, bWin ? Accent : Enemy, 3.f * U, true);
		Text(FString::Printf(TEXT("%d x %d  ·  Abates %d  ·  Mortes %d"), GM->Scores[0], GM->Scores[1], P->Kills, P->Deaths), CX, CY + 10 * U, FLinearColor::White, 1.1f * U, true);
		Text(TEXT("Nova partida em instantes…"), CX, CY + 44 * U, Dim, 0.9f * U, true);
	}
}

void AOZHUD::DrawMinimap(AOZCharacter* P, float X, float Y, float Size)
{
	DrawRect(FLinearColor(0.f, 0.f, 0.f, 0.45f), X, Y, Size, Size);
	const float Range = 11000.f, Scale = Size / (Range * 2.f);
	const FVector Me = P->GetActorLocation();
	const float Yaw = FMath::DegreesToRadians(P->GetControlRotation().Yaw);
	const float CX = X + Size / 2, CY = Y + Size / 2;
	const float Now = GetWorld()->TimeSeconds;
	for (AOZCharacter* C : AOZGameMode::Characters(this))
	{
		if (C == P || !C->bAlive) continue;
		const bool bAlly = C->Team == P->Team;
		if (!bAlly && Now - C->LastShotTime > 1.5f) continue; // inimigo só aparece ao atirar
		const FVector D = C->GetActorLocation() - Me;
		// gira para "frente = cima"
		const float RX = D.X * FMath::Cos(-Yaw) - D.Y * FMath::Sin(-Yaw), RY = D.X * FMath::Sin(-Yaw) + D.Y * FMath::Cos(-Yaw);
		const float PX = CX + RY * Scale, PY = CY - RX * Scale;
		if (PX < X || PX > X + Size || PY < Y || PY > Y + Size) continue;
		DrawRect(bAlly ? Ally : Enemy, PX - 3, PY - 3, 6, 6);
	}
	DrawRect(Accent, CX - 4, CY - 4, 8, 8);
	DrawLine(CX, CY, CX, CY - 12, Accent, 2.f);
}
